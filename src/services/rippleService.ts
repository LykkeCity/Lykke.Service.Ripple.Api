import { Service } from "typedi";
import { Settings } from "../common";
import { RippleAPI } from "ripple-lib";
import { Instructions, Prepare } from "ripple-lib/dist/npm/transaction/types";
import { Payment } from "ripple-lib/dist/npm/transaction/payment";
import { FormattedGetAccountInfoResponse } from "ripple-lib/dist/npm/ledger/accountinfo";
import { FormattedSubmitResponse } from "ripple-lib/dist/npm/transaction/submit";
import { GetBalanceSheet } from "ripple-lib/dist/npm/ledger/balance-sheet";

@Service()
export class RippleService {

    private _api: RippleAPI;

    constructor(private settings: Settings) {
        this._api = new RippleAPI({ server: settings.RippleApi.Ripple.Url });
    }

    async api(): Promise<RippleAPI> {
        if (!this._api.isConnected()) {
            await this._api.connect();
        }

        return this._api;
    }

    getFee(): Promise<string> {
        return this.api().then(api => api.getFee());
    }

    preparePayment(address: string, payment: Payment, instructions?: Instructions): Promise<Prepare> {
        return this.api().then(api => api.preparePayment(address, payment, instructions))
    }    

    getAccountInfo(address: string): Promise<FormattedGetAccountInfoResponse> {
        return this.api().then(api => api.getAccountInfo(address));
    }

    getLedgerVersion(): Promise<number> {
        return this.api().then(api => api.getLedgerVersion());
    }

    getBalanceSheet(address: string): Promise<GetBalanceSheet> {
        return this.api().then(api => api.getBalanceSheet(address));
    }

    submit(signedTransaction: string): Promise<FormattedSubmitResponse> {
        return this.api().then(api => api.submit(signedTransaction));
    }
}