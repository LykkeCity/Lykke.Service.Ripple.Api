import { JsonController, Get } from "routing-controllers";

@JsonController("/capabilities")
export class CapabilitiesController {

    @Get()
    capabiliies() {
        return {
            isTransactionsRebuildingSupported: false,
            areManyInputsSupported: false,
            areManyOutputsSupported: false,
            isTestingTransfersSupported: false,
            isPublicAddressExtensionRequired: true,
            isReceiveTransactionRequired: false,
            canReturnExplorerUrl: false
        };
    }
}