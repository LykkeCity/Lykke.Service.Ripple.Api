import { JsonController, Body, Get, Post, Put, Delete, OnUndefined, QueryParam } from "routing-controllers";
import { IsArray, IsString, IsNotEmpty, IsBase64, IsUUID } from "class-validator";
import { AssetRepository } from "../domain/assets";
import { OperationRepository, OperationEntity, ErrorCode } from "../domain/operations";
import { fromBase64, ADDRESS_SEPARATOR, ParamIsUuid, QueryParamIsPositiveInteger, IsRippleAddress, ParamIsRippleAddress, XRP, DUMMY_TX, Settings, toBase64, XRP_ACCURACY } from "../common";
import { NotImplementedError } from "../errors/notImplementedError";
import { LogService, LogLevel } from "../services/logService";
import { BlockchainError } from "../errors/blockchainError";
import { HistoryRepository, HistoryAddressCategory } from "../domain/history";
import { BalanceRepository } from "../domain/balances";
import { RippleService } from "../services/rippleService";

class BuildSingleRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsString()
    @IsNotEmpty()
    @IsRippleAddress()
    fromAddress: string;

    fromAddressContext?: string;

    @IsString()
    @IsNotEmpty()
    @IsRippleAddress()
    toAddress: string;

    @IsString()
    @IsNotEmpty()
    assetId: string;

    @IsString()
    @IsNotEmpty()
    amount: string;

    includeFee?: boolean;
}

class Input {
    @IsString()
    @IsNotEmpty()
    @IsRippleAddress()
    fromAddress: string;

    fromAddressContext?: string;

    @IsString()
    @IsNotEmpty()
    amount: string;
}

class BuildManyInputsRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsArray()
    @IsNotEmpty()
    inputs: Input[];

    @IsString()
    @IsNotEmpty()
    @IsRippleAddress()
    toAddress: string;

    @IsString()
    @IsNotEmpty()
    assetId: string;
}

class Output {
    @IsString()
    @IsNotEmpty()
    @IsRippleAddress()
    toAddress: string;

    @IsString()
    @IsNotEmpty()
    amount: string;
}

class BuildManyOutputsRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsString()
    @IsNotEmpty()
    @IsRippleAddress()
    fromAddress: string;

    fromAddressContext?: string;

    @IsArray()
    @IsNotEmpty()
    outputs: Output[];

    @IsString()
    @IsNotEmpty()
    assetId: string;
}

class BroadcastRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsString()
    @IsNotEmpty()
    @IsBase64()
    signedTransaction: string;
}

enum State {
    inProgress = "inProgress",
    completed = "completed",
    failed = "failed"
}

interface SignedTransactionModel {
    signedTransaction: string;
    id: string;
}

@JsonController("/transactions")
export class TransactionsController {

    constructor(
        private rippleService: RippleService,
        private logService: LogService,
        private operationRepository: OperationRepository,
        private assetRepository: AssetRepository,
        private historyRepository: HistoryRepository,
        private balanceRepository: BalanceRepository,
        private settings: Settings) {
    }

    private getState(operation: OperationEntity): State {
        return !!operation.FailTime ? State.failed : !!operation.CompletionTime ? State.completed : State.inProgress;
    }

    private getTimestamp(operation: OperationEntity): Date {
        return operation.FailTime || operation.CompletionTime || operation.SendTime;
    }

    private async getHistory(category: HistoryAddressCategory, address: string, take: number, afterHash: string) {
        const history = await this.historyRepository.get(category, address, take, afterHash);

        return history.map(e => ({
            timestamp: e.BlockTime,
            fromAddress: e.From,
            toAsdress: e.To,
            assetId: e.AssetId,
            amount: e.AmountInBaseUnit.toFixed(),
            hash: e.TxId
        }));
    }

    @Post("/single")
    async buildSingle(@Body({ required: true }) request: BuildSingleRequest) {
        const operation = await this.operationRepository.get(request.operationId);
        
        if (!!operation && operation.isRunning) {
            throw new BlockchainError(409, `Operation [${request.operationId}] already ${this.getState(operation)}`);
        }

        const asset = await this.assetRepository.get(request.assetId);
        
        if (!asset) {
            throw new BlockchainError(400, `Unknown asset [${request.assetId}]`);
        }

        const amountInBaseUnit = parseInt(request.amount);

        if (Number.isNaN(amountInBaseUnit) || amountInBaseUnit <= 0) {
            throw new BlockchainError(400, `Invalid amount [${request.amount}]`);
        }

        let amount = asset.fromBaseUnit(amountInBaseUnit);
        let expiration: number;
        let tx: string;
        let fee: number;
        let feeInBaseUnit: number;
        
        const [from, fromTag] = request.fromAddress.split(ADDRESS_SEPARATOR);
        const [to, toTag] = request.toAddress.split(ADDRESS_SEPARATOR);

        if (from == to) {
            const balance = await this.balanceRepository.get(request.fromAddress, request.assetId);
            const balanceInBaseUnit = (balance && balance.AmountInBaseUnit) || 0;
            if (balanceInBaseUnit < amountInBaseUnit) {
                throw new BlockchainError(400, `Not enough [${request.assetId}] on address [${request.fromAddress}]`, ErrorCode.notEnoughBalance);
            }
            expiration = undefined;
            tx = DUMMY_TX;
            fee = 0;
            feeInBaseUnit = 0;
        } else {

            // refine amounts and fees depending on asset,
            // fee is accounted in native asset (XRP)
            
            const required: any = { XRP: this.settings.RippleApi.Ripple.Reserve || 0 };
            const feeAmount = await this.rippleService.getFee();

            fee = parseFloat(feeAmount);
            feeInBaseUnit = fee * Math.pow(10, XRP_ACCURACY);

            if (request.assetId == XRP) {
                if (request.includeFee) {
                    if (amount >= fee) {
                        amount -= fee;
                    } else {
                        throw new BlockchainError(400, `Amount [${amount}] is less than fee [${fee}]`, ErrorCode.amountIsTooSmall);
                    }
                }
                required[XRP] += amount + fee;
            } else {
                required[XRP] += fee;
                required[request.assetId] = amount;
            }

            // check balances of "from" address

            const balances = (await this.rippleService.getBalances(from)).reduce((r: any, b) => { 
                r[b.currency] = parseFloat(b.value);
                return r;
            }, {});

            for (const k of Object.getOwnPropertyNames(required)) {
                if (!balances[k] || balances[k] < required[k]) {
                    throw new BlockchainError(400, `Not enough [${k}] on address [${from}]`, ErrorCode.notEnoughBalance);
                }
            }

            // build transaction

            const assetAmount = {
                value: amount.toFixed(asset.Accuracy),
                currency: asset.AssetId,
                counterparty: asset.Address
            };
            const transaction = await this.rippleService.preparePayment(from, {
                source: {
                    address: from,
                    tag: fromTag && parseInt(fromTag),
                    maxAmount: assetAmount
                },
                destination: {
                    address: to,
                    tag: toTag && parseInt(toTag),
                    amount: assetAmount
                }
            }, {
                maxLedgerVersionOffset: this.settings.RippleApi.Ripple.Expiration,
                fee: feeAmount
            });

            expiration = transaction.instructions.maxLedgerVersion * 10;            
            tx = transaction.txJSON;
        }

        await this.operationRepository.upsert(request.operationId, request.assetId, request.fromAddress,
            request.toAddress, amount, amountInBaseUnit, fee, feeInBaseUnit, expiration);

        return {
            transactionContext: toBase64(tx)
        };
    }

    @Post("/many-inputs")
    async buildManyInputs(@Body({ required: true }) request: BuildManyInputsRequest) {
        throw new NotImplementedError();
    }

    @Post("/many-outputs")
    async buildManyOutputs(@Body({ required: true }) request: BuildManyOutputsRequest) {
        throw new NotImplementedError();
    }

    @Put()
    async Rebuild() {
        throw new NotImplementedError();
    }

    @Post("/broadcast")
    async broadcast(@Body({ required: true }) request: BroadcastRequest) {

        const operation = await this.operationRepository.get(request.operationId);
        if (!operation) {
            // transaction must be built before
            throw new BlockchainError(400, `Unknown operation [${request.operationId}]`);
        } else if (!!operation.FailTime) {
            // in case of error between broadcasting transaction and saving operation state
            // operation may be already processed by tracking job
            throw new BlockchainError(400, operation.Error, operation.ErrorCode);        
        } else if (!!operation.SendTime || !!operation.CompletionTime) {
            throw new BlockchainError(409, `Operation [${request.operationId}] already ${this.getState(operation)}`);
        }

        const sendTime = new Date();
        const block = operation.Block || ((await this.rippleService.getLedgerVersion()) * 10 + 1);
        const blockTime = operation.BlockTime || sendTime;
        const completionTime = operation.CompletionTime || sendTime;
        const data = fromBase64<SignedTransactionModel>(request.signedTransaction);

        // for now operation may be processed by multiple threads,
        // if process is parallelized before signing then simulated transaction may be broadcasted
        // multiple times with different hashes (due to using timestamp as transaction hash);
        // to prevent double spending for simulated transactions we use operation ID instead of timestamp as transaction hash;
        const txId = data.id || operation.OperationId.replace(/[{}-]/g, "");

        // prevent tx hash duplication issues
        const operationIdByTxId = await this.operationRepository.getOperationIdByTxId(txId);
        if (!!operationIdByTxId && operationIdByTxId != operation.OperationId) {
            const message = "Duplicated transaction hash";
            await this.logService.write(LogLevel.warning, TransactionsController.name, this.broadcast.name, message, txId);
            await this.operationRepository.update(operation.OperationId, { blockchainError: message });
            throw new BlockchainError(400, message, ErrorCode.buildingShouldBeRepeated, {
                operationIdByTxId,
                operation
            });
        }

        // connect operation to transaction before broadcasting to process transaction
        // correctly in case of errors between broadcasting and saving operation state 
        await this.operationRepository.update(operation.OperationId, { txId });

        if (!!data.signedTransaction) {

            // send real transaction to the blockchain,
            // balances will be handled by job, when transaction will be
            // included in block and when it becomes irreversible,
            // and mark operation as sent

            const result = await this.rippleService.submit(data.signedTransaction);

            if (result.resultCode != "tesSUCCESS") {
                await this.logService.write(LogLevel.warning, TransactionsController.name, this.broadcast.name, "BlockchainError", result.resultCode);
                await this.operationRepository.update(operation.OperationId, { blockchainError: result.resultCode });
            }

            // most of broadcasting result states are not final and even valid transaction may be not applied due to various reasons,
            // so we delegate recognizing transaction state to tracking job and return OK at the moment;
            // for details see:
            // - https://developers.ripple.com/finality-of-results.html
            // - https://developers.ripple.com/reliable-transaction-submission.html

            if (result.resultCode == "tefPAST_SEQ" || result.resultCode == "tefMAX_LEDGER") {
                throw new BlockchainError(400, "Transaction rejected", ErrorCode.buildingShouldBeRepeated, result);
            } else if (result.resultCode.startsWith("tem")) {
                throw new BlockchainError(400, "Transaction rejected", ErrorCode.unknown, result);
            }

            await this.operationRepository.update(operation.OperationId, { sendTime });
        } else {

            // for simulated transaction we immediately update balances and history,
            // and mark operation as completed

            const balanceChanges = [
                { address: operation.FromAddress, affix: -operation.Amount, affixInBaseUnit: -operation.AmountInBaseUnit },
                { address: operation.ToAddress, affix: operation.Amount, affixInBaseUnit: operation.AmountInBaseUnit }
            ];

            for (const bc of balanceChanges) {
                await this.balanceRepository.upsert(bc.address, operation.AssetId, operation.OperationId, bc.affix, bc.affixInBaseUnit, block);
                await this.logService.write(LogLevel.info, TransactionsController.name, this.broadcast.name,
                    "Balance change recorded", JSON.stringify({ ...bc, assetId: operation.AssetId, txId }));
            }

            await this.historyRepository.upsert(operation.FromAddress, operation.ToAddress,
                operation.AssetId, operation.Amount, operation.AmountInBaseUnit,
                block, blockTime, txId, operation.OperationId);
            
            await this.operationRepository.update(operation.OperationId, { sendTime, completionTime, blockTime, block });
        }

        return {
            txId
        };
    }

    @Get("/broadcast/single/:operationId")
    async getSingle(@ParamIsUuid("operationId") operationId: string) {
        const operation = await this.operationRepository.get(operationId);
        if (!!operation && operation.isRunning) {
            return {
                operationId,
                state: this.getState(operation),
                timestamp: this.getTimestamp(operation),
                amount: operation.AmountInBaseUnit.toFixed(),
                fee: operation.FeeInBaseUnit.toFixed(),
                hash: operation.TxId,
                block: operation.Block,
                error: operation.Error,
                errorCode: operation.ErrorCode,
                blockchainError: operation.BlockchainError
            };
        } else {
            return null;
        }
    }

    @Get("/broadcast/many-inputs/:operationId")
    async getManyInputs(@ParamIsUuid("operationId") operationId: string) {
        throw new NotImplementedError();
    }

    @Get("/broadcast/many-outputs/:operationId")
    async getManyOutputs(@ParamIsUuid("operationId") operationId: string) {
        throw new NotImplementedError();
    }

    @Delete("/broadcast/:operationId")
    @OnUndefined(200)
    async deleteBroadcasted(@ParamIsUuid("operationId") operationId: string) {
        await this.operationRepository.update(operationId, {
            deleteTime: new Date()
        });
    }

    @Get("/history/from/:address")
    async getHistoryFrom(
        @ParamIsRippleAddress("address") address: string,
        @QueryParamIsPositiveInteger("take") take: number,
        @QueryParam("afterHash") afterHash: string) {

        return await this.getHistory(HistoryAddressCategory.From, address, take, afterHash);
    }

    @Get("/history/to/:address")
    async getHistoryTo(
        @ParamIsRippleAddress("address") address: string,
        @QueryParamIsPositiveInteger("take") take: number,
        @QueryParam("afterHash") afterHash: string) {

        return await this.getHistory(HistoryAddressCategory.To, address, take, afterHash);
    }

    @Post("/history/from/:address/observation")
    @OnUndefined(200)
    async observeFrom(@ParamIsRippleAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }

    @Delete("/history/from/:address/observation")
    @OnUndefined(200)
    async deleteFromObservation(@ParamIsRippleAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }

    @Post("/history/to/:address/observation")
    @OnUndefined(200)
    async observeTo(@ParamIsRippleAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }

    @Delete("/history/to/:address/observation")
    @OnUndefined(200)
    async deleteToObservation(@ParamIsRippleAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }
}