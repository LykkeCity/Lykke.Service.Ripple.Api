import { Middleware, KoaMiddlewareInterface, } from "routing-controllers";
import { Context } from "koa";
import { ErrorCode } from "../domain/operations";

@Middleware({ type: 'before' })
export class ErrorMiddleware implements KoaMiddlewareInterface {

    async use(ctx: Context, next: (err?: any) => Promise<any>): Promise<any> {

        // We don't need to wrap this into try..catch because
        // routing-controllers lib has built-in error handler.
        // See https://github.com/typestack/routing-controllers#error-handlers for details
        await next();

        // To implement blockchain integration contract:
        // 1. Replace 'message' with 'errorMessage' and add 'errorCode' if necessary
        if (ctx.status >= 400 && !!ctx.body) {
            ctx.body.errorMessage = ctx.body.errorMessage || ctx.body.message || ctx.message;
            ctx.body.errorCode = ctx.body.errorCode || ErrorCode.unknown;
            delete ctx.body.message;
        }

        // 2. Map 'errors' to 'modelErrors'
        if (ctx.status == 400 && !!ctx.body && !!ctx.body.errors) {
            ctx.body.modelErrors = {};
            ctx.body.errors.filter((e: any) => !!e.property && !!e.constraints)
                .forEach((e: any) => {
                    ctx.body.modelErrors[e.property] = [];
                    for (const k in e.constraints) {
                        ctx.body.modelErrors[e.property].push(e.constraints[k]);
                    }
                });
            delete ctx.body.errors;
        }
    }
}