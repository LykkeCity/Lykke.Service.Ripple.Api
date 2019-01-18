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

        let isValid = false;

        if (isRippleAddress(address)) {
            const addressParts = address.split(ADDRESS_SEPARATOR);
            const addressIsTagged = addressParts.length > 1;
            const accountSettings = await this.rippleService.getSettings(addressParts[0]).catch(_ => undefined);

            isValid = !!accountSettings && (!accountSettings.requireDestinationTag || addressIsTagged);
        }

        return {
            isValid
        };
    }
}