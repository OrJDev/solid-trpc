import { createHooksInternalProxy, } from "./createTRPCSolid";
import { createHooksInternal, } from "./shared/hooks/createHooksInternal";
/**
 * @deprecated use `createTRPCSolid` instead
 */
export function createSolidQueryHooks(opts) {
    const trpc = createHooksInternal(opts);
    const proxy = createHooksInternalProxy(trpc);
    return {
        ...trpc,
        proxy,
    };
}
