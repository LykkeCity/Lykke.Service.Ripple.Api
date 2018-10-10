import { BlockchainError } from "./blockchainError";

export class ConflictError extends BlockchainError {
    constructor(message?: string) {
        super(409, message);
    }   
}