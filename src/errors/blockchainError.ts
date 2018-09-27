import { HttpError } from "routing-controllers";
import { ErrorCode } from "../domain/operations";

export class BlockchainError extends HttpError {
    constructor(status = 500, message?: string, public errorCode = ErrorCode.unknown, public data?: any) {
        super(status, message);
    }
}