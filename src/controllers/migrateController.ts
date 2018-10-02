import { JsonController, Post, Body } from "routing-controllers";
import { BalanceRepository } from "../domain/balances";
import { AssetRepository } from "../domain/assets";
import { ParamsRepository } from "../domain/params";
import { IsNotEmpty, IsString } from "class-validator";
import { MongoClient } from "mongodb";

class MigrateRequest {
    @IsNotEmpty()
    @IsString()
    connectionString: string;
}

@JsonController("/migrate")
export class MigrateController {

    constructor(
        private assetRepository: AssetRepository,
        private balanceRepository: BalanceRepository,
        private paramsRepository: ParamsRepository) {
    }

    @Post()
    async fromV1toV2(@Body({ required: true }) request: MigrateRequest) {
        const client = await MongoClient.connect(request.connectionString, { useNewUrlParser: true });
        const db = client.db("ripple");
        const observableAddresses = await db.collection("accounts")
            .find()
            .map(_ => _._id)
            .toArray();
        
        for (const address of observableAddresses) {
            await this.balanceRepository.observe(address);
        }

        const lastTransactionPages = await db.collection("transactions")
            .find({ page: { $exists: true, $ne: null } })
            .sort({ timestamp: -1 })
            .limit(1)
            .map(_ => _.page)
            .toArray();
        
        const lastProcessedLedger = !!lastTransactionPages[0] && lastTransactionPages[0] / 10; 
        if (!!lastProcessedLedger) {
            await this.paramsRepository.upsert(lastProcessedLedger);
        }

        const xrp = await this.assetRepository.get("XRP");
        if (!xrp) {
            await this.assetRepository.upsert("XRP", "", "Ripple native asset", 6);
        }

        return {
            lastProcessedLedger,
            observableAddresses
        }
    }
}