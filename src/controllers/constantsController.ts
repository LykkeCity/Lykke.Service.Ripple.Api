import { JsonController, Get } from "routing-controllers";
import { ADDRESS_SEPARATOR } from "../common";

@JsonController("/constants")
export class ConstantsController {

    @Get()
    constants() {
        return {
            publicAddressExtension: {
                separator: ADDRESS_SEPARATOR,
                displayName: "Tag",
                baseDisplayName: "Address"
            }
        };
    }
}