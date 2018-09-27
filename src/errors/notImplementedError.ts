import { BlockchainError } from "./blockchainError";

export class NotImplementedError extends BlockchainError {
    constructor(message?: string) {
        super(501, message);
    }
}