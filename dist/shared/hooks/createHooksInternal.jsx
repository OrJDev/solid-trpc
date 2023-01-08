/* eslint-disable solid/reactivity */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createInfiniteQuery as __useInfiniteQuery, createMutation as __useMutation, createQuery as __useQuery, hashQueryKey, QueryClientProvider, } from "@adeora/solid-query";
import { createTRPCClient, } from "@trpc/client";
import { createEffect, mergeProps, onCleanup, useContext as __useContext, } from "solid-js";
import { TRPCContext, } from "../../internals/context";
import { getArrayQueryKey } from "../../internals/getArrayQueryKey";
function getClientArgs(pathAndInput, opts) {
    const [path, input] = pathAndInput;
    return [path, input, opts?.trpc];
}
/**
 * Create strongly typed react hooks
 * @internal
 */
export function createHooksInternal(config) {
    // const mutationSuccessOverride: UseMutationOverride["onSuccess"] =
    //   config?.unstable_overrides?.useMutation?.onSuccess ??
    //   ((options) => options.originalFn());
    const Context = (config?.context ?? TRPCContext);
    const SolidQueryContext = config?.solidQueryContext;
    const createClient = (opts) => {
        return createTRPCClient(opts);
    };
    const TRPCProvider = (props) => {
        const { abortOnUnmount = false, client, queryClient } = props;
        return (<Context.Provider value={{
                abortOnUnmount,
                queryClient,
                client,
                fetchQuery: (pathAndInput, opts) => {
                    return queryClient.fetchQuery(getArrayQueryKey(pathAndInput), () => client.query(...getClientArgs(pathAndInput, opts)), opts);
                },
                fetchInfiniteQuery: (pathAndInput, opts) => {
                    return queryClient.fetchInfiniteQuery(getArrayQueryKey(pathAndInput), ({ pageParam }) => {
                        const [path, input] = pathAndInput;
                        const actualInput = { ...input, cursor: pageParam };
                        return client.query(...getClientArgs([path, actualInput], opts));
                    }, opts);
                },
                prefetchQuery: (pathAndInput, opts) => {
                    return queryClient.prefetchQuery(getArrayQueryKey(pathAndInput), () => client.query(...getClientArgs(pathAndInput, opts)), opts);
                },
                prefetchInfiniteQuery: (pathAndInput, opts) => {
                    return queryClient.prefetchInfiniteQuery(getArrayQueryKey(pathAndInput), ({ pageParam }) => {
                        const [path, input] = pathAndInput;
                        const actualInput = { ...input, cursor: pageParam };
                        return client.query(...getClientArgs([path, actualInput], opts));
                    }, opts);
                },
                invalidateQueries: (...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.invalidateQueries(getArrayQueryKey(queryKey), ...rest);
                },
                refetchQueries: (...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.refetchQueries(getArrayQueryKey(queryKey), ...rest);
                },
                cancelQuery: (pathAndInput) => {
                    return queryClient.cancelQueries(getArrayQueryKey(pathAndInput));
                },
                setQueryData: (...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.setQueryData(getArrayQueryKey(queryKey), ...rest);
                },
                getQueryData: (...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.getQueryData(getArrayQueryKey(queryKey), ...rest);
                },
                setInfiniteQueryData: (...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.setQueryData(getArrayQueryKey(queryKey), ...rest);
                },
                getInfiniteQueryData: (...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.getQueryData(getArrayQueryKey(queryKey), ...rest);
                },
            }}>
        <QueryClientProvider client={queryClient} {...(props.queryClientOpts ?? {})}>
          {props.children}
        </QueryClientProvider>
      </Context.Provider>);
    };
    function useContext() {
        return __useContext(Context);
    }
    function useQuery(pathAndInput, opts) {
        const ctx = useContext();
        const withCtxOpts = () => mergeProps(opts?.(), {
            context: SolidQueryContext,
        });
        if (typeof window === "undefined" &&
            opts?.().enabled !== false &&
            !ctx.queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput()))) {
            void ctx.prefetchQuery(pathAndInput(), opts?.());
        }
        return __useQuery(() => ({
            queryKey: getArrayQueryKey(pathAndInput()),
            queryFn: () => {
                return ctx.client.query(...getClientArgs(pathAndInput(), opts?.()));
            },
            ...withCtxOpts?.(),
        }));
    }
    function useMutation(path, opts) {
        const ctx = useContext();
        const withCtxOpts = () => mergeProps(opts?.(), {
            context: SolidQueryContext,
        });
        return __useMutation(() => ({
            mutationFn: (input) => {
                const actualPath = Array.isArray(path) ? path[0] : path;
                return ctx.client.mutation(...getClientArgs([actualPath, input], opts));
            },
            ...withCtxOpts(),
        }));
    }
    /* istanbul ignore next */
    /**
     * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
     *  **Experimental.** API might change without major version bump
     * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
     */
    function useSubscription(pathAndInput, opts) {
        const ctx = useContext();
        return createEffect(() => {
            if (!(opts.enabled ?? true)) {
                return;
            }
            // noop
            (() => {
                return hashQueryKey(pathAndInput());
            })();
            let isStopped = false;
            const subscription = ctx.client.subscription(pathAndInput()[0], (pathAndInput()[1] ?? undefined), {
                onStarted: () => {
                    if (!isStopped) {
                        opts?.onStarted?.();
                    }
                },
                onData: (data) => {
                    if (!isStopped) {
                        opts?.onData(data);
                    }
                },
                onError: (err) => {
                    if (!isStopped) {
                        opts?.onError?.(err);
                    }
                },
            });
            onCleanup(() => {
                isStopped = true;
                subscription.unsubscribe();
            });
        });
    }
    function useInfiniteQuery(pathAndInput, opts) {
        const ctx = useContext();
        const withCtxOpts = () => mergeProps(opts?.(), {
            context: SolidQueryContext,
        });
        if (typeof window === "undefined" &&
            opts?.().enabled !== false &&
            !ctx.queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput()))) {
            void ctx.prefetchInfiniteQuery(pathAndInput, opts);
        }
        return __useInfiniteQuery(() => ({
            queryKey: getArrayQueryKey(pathAndInput()),
            queryFn: (queryFunctionContext) => {
                const actualInput = {
                    ...(pathAndInput()[1] ?? {}),
                    cursor: queryFunctionContext.pageParam,
                };
                return ctx.client.query(...getClientArgs([pathAndInput()[0], actualInput], opts?.()));
            },
            ...withCtxOpts(),
        }));
    }
    return {
        Provider: TRPCProvider,
        createClient,
        useContext,
        useQuery,
        useMutation,
        useSubscription,
        useInfiniteQuery,
    };
}
/**
 * Hack to infer the type of `createReactQueryHooks`
 * @link https://stackoverflow.com/a/59072991
 */
class GnClass {
    fn() {
        return createHooksInternal();
    }
}
