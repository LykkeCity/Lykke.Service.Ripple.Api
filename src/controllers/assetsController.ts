import { JsonController, Get, Param, QueryParam, Body, Post, OnUndefined } from "routing-controllers";
import { IsNotEmpty, IsString, IsNumber, IsPositive, IsOptional } from "../../node_modules/class-validator";
import { QueryParamIsPositiveInteger, IsRippleAddress } from "../common";
import { AssetRepository } from "../domain/assets";
import { BlockchainError } from "../errors/blockchainError";

class CreateAssetRequest {
    @IsString()
    @IsNotEmpty()
    assetId: string;

    @IsNumber()
    @IsNotEmpty()
    @IsPositive()
    accuracy: number;

    @IsOptional()
    @IsString()
    @IsRippleAddress()    
    address: string;

    @IsString()
    @IsNotEmpty()
    name: string;
}

@JsonController("/assets")
export class AssetsController {

    constructor(private assetRepository: AssetRepository) {
    }

    @Get()
    async list(
        @QueryParamIsPositiveInteger("take") take: number,
        @QueryParam("continuation") continuation: string) {

        if (!this.assetRepository.validateContinuation(continuation)) {
            throw new BlockchainError(400, "Query parameter [continuation] is invalid");
        }

        const query = await this.assetRepository.get(take, continuation);

        return {
            continuation: query.continuation,
            items: query.items.map(e => ({
                assetId: e.AssetId,
                address: e.Address,
                name: e.Name,
                accuracy: e.Accuracy
            }))
        };
    }

    @Get("/:assetId")
    async item(@Param("assetId") assetId: string) {
        const asset = await this.assetRepository.get(assetId);
        if (!!asset) {
            return {
                assetId: asset.AssetId,
                address: asset.Address,
                name: asset.Name,
                accuracy: asset.Accuracy
            }
        } else {
            return null;
        }
    }

    @Post()
    @OnUndefined(200)
    async create(@Body({ required: true }) request: CreateAssetRequest) {
        await this.assetRepository.upsert(request.assetId, request.address, request.name, request.accuracy);
    }
}