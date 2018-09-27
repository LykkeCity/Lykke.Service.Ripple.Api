import { JsonController, Get, Param, QueryParam, Post, Delete, OnUndefined } from "routing-controllers";
import { BalanceRepository } from "../domain/balances";
import { AssetRepository } from "../domain/assets";
import { RippleService } from "../services/rippleService";
import { ConflictError } from "../errors/conflictError";
import { BlockchainError } from "../errors/blockchainError";
import { QueryParamIsPositiveInteger, ParamIsRippleAddress } from "../common";

@JsonController("/balances")
export class BalancesController {

    constructor(
        private assetRepository: AssetRepository,
        private balanceRepository: BalanceRepository,
        private rippleService: RippleService) {
    }

    @Get()
    async balances(
        @QueryParamIsPositiveInteger("take") take: number,
        @QueryParam("continuation") continuation?: string) {

        if (!this.balanceRepository.validateContinuation(continuation)) {
            throw new BlockchainError(400, "Query parameter [continuation] is invalid");
        }

        const block = (await this.rippleService.getLedgerVersion()) * 10;
        let items: any[] = [];

        // CosmosDB doesn't suppport multiple $match-es in public preview version,
        // so we can't filter out zero balances on server.
        // Instead we have to set non-zero balances incrementally
        // to return exactly [take] number of items

        do {
            const result = await this.balanceRepository.get(take, continuation);

            continuation = result.continuation;

            for (const e of result.items) {
                if (e.AmountInBaseUnit > 0) {
                    items.push({
                        address: e._id.Address,
                        assetId: e._id.AssetId,
                        balance: e.AmountInBaseUnit.toFixed(),
                        block: Math.max(e.Block, block)
                    });
                    take--;
                }
            }

        } while (take > 0 && !!continuation)

        return {
            continuation,
            items
        };
    }

    @Get("/:address/:assetId")
    async balanceOf(
        @ParamIsRippleAddress("address") address: string,
        @Param("assetId") assetId: string) {

        const asset = await this.assetRepository.get(assetId);
        if (asset == null) {
            throw new BlockchainError(400, `Unknown assetId [${assetId}]`);
        }

        const block = await this.rippleService.getLedgerVersion();
        const value = await this.balanceRepository.get(address, assetId);

        if (!!value) {
            return {
                address: address,
                assetId: assetId,
                balance: value.AmountInBaseUnit.toFixed(),
                block: block * 10
            };
        } else {
            return null;
        }
    }

    @Post("/:address/observation")
    @OnUndefined(200)
    async observe(@ParamIsRippleAddress("address") address: string) {
        if (await this.balanceRepository.isObservable(address)) {
            throw new ConflictError(`Address [${address}] is already observed`);
        } else {
            await this.balanceRepository.observe(address);
        }
    }

    @Delete("/:address/observation")
    @OnUndefined(200)
    async deleteObservation(@ParamIsRippleAddress("address") address: string): Promise<any> {
        if (await this.balanceRepository.isObservable(address)) {
            await this.balanceRepository.remove(address);
        } else {
            return null;
        }
    }
}