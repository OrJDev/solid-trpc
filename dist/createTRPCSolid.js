import { createFlatProxy } from "@trpc/server/shared";
import { createSolidProxyDecoration, createSolidQueryUtilsProxy, } from "./shared";
import { createHooksInternal, } from "./shared/hooks/createHooksInternal";
/**
 * @internal
 */
export function createHooksInternalProxy(trpc) {
    return createFlatProxy((key) => {
        if (key === "useContext") {
            return () => {
                const context = trpc.useContext();
                // create a stable reference of the utils context
                return createSolidQueryUtilsProxy(context);
            };
        }
        if (key in trpc) {
            return trpc[key];
        }
        return createSolidProxyDecoration(key, trpc);
    });
}
export function createTRPCSolid(opts) {
    const hooks = createHooksInternal(opts);
    const proxy = createHooksInternalProxy(hooks);
    return proxy;
}
