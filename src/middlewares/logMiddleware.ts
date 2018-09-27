import { Middleware, KoaMiddlewareInterface, } from "routing-controllers";
import { LogLevel, LogService } from "../services/logService";
import { Context } from "koa";

@Middleware({ type: 'before' })
export class LogMiddleware implements KoaMiddlewareInterface {

    constructor(private log: LogService) {
    }

    async use(ctx: Context, next: (err?: any) => Promise<any>): Promise<any> {

        // we don't need to wrap this into try..catch because
        // routing-controllers lib has built-in error handler
        // see https://github.com/typestack/routing-controllers#error-handlers for details
        await next();

        // log client and server errors
        if (ctx.status >= 400) {
            const level = ctx.status < 500 ? LogLevel.warning : LogLevel.error;
            const component = LogMiddleware.name;
            const process = ctx.url;
            const message = ctx.body && (ctx.body.errorMessage || ctx.body.message || ctx.message);
            const context = JSON.stringify({ request: ctx.request.body, response: ctx.body });
            const error = ctx.body && ctx.body.name;
            const stack = ctx.body && ctx.body.stack;

            await this.log.write(level, component, process, message, context, error, stack);
        }
    }
}