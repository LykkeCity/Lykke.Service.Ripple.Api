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

        if (isRippleAddress(address)) {

            var addressParts = address.split(ADDRESS_SEPARATOR);
            var accountExist = await this.rippleService.getAccountInfo(addressParts[0]).then(_ => true).catch(_ => false);

            if (accountExist) {
        
                var accountSettings = (await this.rippleService.getSettings(address)) || {};
                var addressIsTagged = addressParts.length > 1;

                return !accountSettings.requireDestinationTag || addressIsTagged;
            }
        }

        return false;
    }
}