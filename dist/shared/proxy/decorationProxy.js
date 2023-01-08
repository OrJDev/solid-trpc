import { createRecursiveProxy } from "@trpc/server/shared";
import { getQueryKey } from "../../internals/getQueryKey";
/**
 * Create proxy for decorating procedures
 * @internal
 */
export function createSolidProxyDecoration(name, hooks) {
    return createRecursiveProxy((opts) => {
        const args = opts.args;
        const pathCopy = [name, ...opts.path];
        // The last arg is for instance `.useMutation` or `.useQuery()`
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const lastArg = pathCopy.pop();
        // The `path` ends up being something like `post.byId`
        const path = pathCopy.join(".");
        if (lastArg === "useMutation") {
            return hooks[lastArg](path, ...args);
        }
        return hooks[lastArg](() => getQueryKey(path, typeof args[0] === "function" ? args[0]() : args[0]), args[1]);
    });
}
