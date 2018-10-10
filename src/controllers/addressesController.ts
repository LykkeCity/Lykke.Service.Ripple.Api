import { JsonController, Get, Param } from "routing-controllers";
import { NotImplementedError } from "../errors/notImplementedError";
import { isRippleAddress, ParamIsRippleAddress, ADDRESS_SEPARATOR } from "../common";
import { RippleService } from "../services/rippleService";

@JsonController("/addresses")
export class AddressesController {

    constructor(private rippleService: RippleService) {
    }

    @Get("/:address/explorer-url")
    explorerUrl(@ParamIsRippleAddress("address") address: string) {
        throw new NotImplementedError();
    }

    @Get("/:address/validity")
    async isValid(@Param("address") address: string) {
        return {
            isValid: isRippleAddress(address) &&
                !!(await this.rippleService.getAccountInfo(address.split(ADDRESS_SEPARATOR)[0]).then(_ => true).catch(_ => false))
        };
    }
}