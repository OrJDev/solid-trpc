import { createFlatProxy, createRecursiveProxy } from "@trpc/server/shared";
import { contextProps, } from "../../internals/context";
import { getQueryKey } from "../../internals/getQueryKey";
/**
 * @internal
 */
export function createSolidQueryUtilsProxy(context) {
    return createFlatProxy((key) => {
        const contextName = key;
        if (contextProps.includes(contextName)) {
            return context[contextName];
        }
        return createRecursiveProxy(({ path, args }) => {
            const pathCopy = [key, ...path];
            const utilName = pathCopy.pop();
            const fullPath = pathCopy.join(".");
            const getOpts = (name) => {
                if (["setData", "setInfiniteData"].includes(name)) {
                    const [updater, input, ...rest] = args;
                    const queryKey = getQueryKey(fullPath, input);
                    return {
                        queryKey,
                        updater,
                        rest,
                    };
                }
                const [input, ...rest] = args;
                const queryKey = getQueryKey(fullPath, input);
                return {
                    queryKey,
                    rest,
                };
            };
            const { queryKey, rest, updater } = getOpts(utilName);
            const contextMap = {
                fetch: () => context.fetchQuery(queryKey, ...rest),
                fetchInfinite: () => context.fetchInfiniteQuery(queryKey, ...rest),
                prefetch: () => context.prefetchQuery(queryKey, ...rest),
                prefetchInfinite: () => context.prefetchInfiniteQuery(queryKey, ...rest),
                invalidate: () => context.invalidateQueries(queryKey, ...rest),
                refetch: () => context.refetchQueries(queryKey, ...rest),
                cancel: () => context.cancelQuery(queryKey, ...rest),
                setData: () => context.setQueryData(queryKey, updater, ...rest),
                setInfiniteData: () => context.setInfiniteQueryData(queryKey, updater, ...rest),
                getData: () => context.getQueryData(queryKey),
                getInfiniteData: () => context.getInfiniteQueryData(queryKey),
            };
            return contextMap[utilName]();
        });
    });
}
