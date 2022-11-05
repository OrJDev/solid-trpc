import {
  DehydratedState,
  QueryClient,
  CreateInfiniteQueryOptions,
  CreateInfiniteQueryResult,
  CreateMutationOptions,
  CreateMutationResult,
  CreateQueryOptions,
  CreateQueryResult,
  createInfiniteQuery as __useInfiniteQuery,
  createMutation as __useMutation,
  createQuery as __useQuery,
  hashQueryKey,
  useQueryClient,
  QueryClientProviderProps,
  QueryClientProvider,
} from "@tanstack/solid-query";
import {
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientErrorLike,
  TRPCRequestOptions,
  createTRPCClient,
} from "@trpc/client";
import type {
  AnyRouter,
  ProcedureRecord,
  inferHandlerInput,
  inferProcedureClientError,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from "@trpc/server";
import { inferObservableValue } from "@trpc/server/observable";
import {
  Accessor,
  Context,
  createEffect,
  createMemo,
  createSignal,
  JSX,
  onCleanup,
  onMount,
  useContext as __useContext,
} from "solid-js";
import {
  SSRState,
  TRPCContext,
  TRPCContextProps,
  TRPCContextState,
} from "../../internals/context";
import { getArrayQueryKey } from "../../internals/getArrayQueryKey";
import { CreateTRPCSolidOptions, UseMutationOverride } from "../types";

export type OutputWithCursor<TData, TCursor = any> = {
  cursor: TCursor | null;
  data: TData;
};

export interface TRPCReactRequestOptions
  // For RQ, we use their internal AbortSignals instead of letting the user pass their own
  extends Omit<TRPCRequestOptions, "signal"> {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
  /**
   * Opt out or into aborting request on unmount
   */
  abortOnUnmount?: boolean;
}

export interface TRPCUseQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

export type { TRPCContext, TRPCContextState } from "../../internals/context";

export interface UseTRPCQueryOptions<TPath, TInput, TOutput, TData, TError>
  extends CreateQueryOptions<TOutput, TError, TData, () => [TPath, TInput]>,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCInfiniteQueryOptions<TPath, TInput, TOutput, TError>
  extends CreateInfiniteQueryOptions<
      TOutput,
      TError,
      TOutput,
      TOutput,
      () => [TPath, TInput]
    >,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCMutationOptions<
  TInput,
  TError,
  TOutput,
  TContext = unknown
> extends CreateMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCSubscriptionOptions<TOutput, TError> {
  enabled?: boolean;
  onStarted?: () => void;
  onData: (data: TOutput) => void;
  onError?: (err: TError) => void;
}

function getClientArgs<TPathAndInput extends unknown[], TOptions>(
  pathAndInput: TPathAndInput,
  opts: TOptions
) {
  const [path, input] = pathAndInput;
  return [path, input, (opts as any)?.trpc] as const;
}

type inferInfiniteQueryNames<TObj extends ProcedureRecord> = {
  [TPath in keyof TObj]: inferProcedureInput<TObj[TPath]> extends {
    cursor?: any;
  }
    ? TPath
    : never;
}[keyof TObj];

type inferProcedures<TObj extends ProcedureRecord> = {
  [TPath in keyof TObj]: {
    input: inferProcedureInput<TObj[TPath]>;
    output: inferProcedureOutput<TObj[TPath]>;
  };
};

export interface TRPCProviderProps<TRouter extends AnyRouter, TSSRContext>
  extends TRPCContextProps<TRouter, TSSRContext> {
  children: JSX.Element;
}

export type TRPCProvider<TRouter extends AnyRouter, TSSRContext> = (
  props: TRPCProviderProps<TRouter, TSSRContext> & {
    queryClientOpts?: Omit<QueryClientProviderProps, "client">;
  }
) => JSX.Element;

export type UseDehydratedState<TRouter extends AnyRouter> = (
  client: TRPCClient<TRouter>,
  trpcState: DehydratedState | undefined
) => Accessor<DehydratedState | undefined>;

export type CreateClient<TRouter extends AnyRouter> = (
  opts: CreateTRPCClientOptions<TRouter>
) => TRPCClient<TRouter>;

interface TRPCHookResult {
  trpc: {
    path: string;
  };
}

/**
 * @internal
 */
export type UseTRPCQueryResult<TData, TError> = CreateQueryResult<
  TData,
  TError
> &
  TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCInfiniteQueryResult<TData, TError> =
  CreateInfiniteQueryResult<TData, TError> & TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCMutationResult<TData, TError, TVariables, TContext> =
  CreateMutationResult<TData, TError, TVariables, TContext> & TRPCHookResult;

/**
 * Makes a stable reference of the `trpc` prop
 */
function useHookResult(value: TRPCHookResult["trpc"]): TRPCHookResult["trpc"] {
  const ref = { current: value };
  ref.current.path = value.path;
  return ref.current;
}
/**
 * Create strongly typed react hooks
 * @internal
 */
export function createHooksInternal<
  TRouter extends AnyRouter,
  TSSRContext = unknown
>(config?: CreateTRPCSolidOptions<TRouter>) {
  const mutationSuccessOverride: UseMutationOverride["onSuccess"] =
    config?.unstable_overrides?.useMutation?.onSuccess ??
    ((options) => options.originalFn());

  type TQueries = TRouter["_def"]["queries"];
  type TSubscriptions = TRouter["_def"]["subscriptions"];
  type TMutations = TRouter["_def"]["mutations"];

  type TError = TRPCClientErrorLike<TRouter>;
  type TInfiniteQueryNames = inferInfiniteQueryNames<TQueries>;

  type TQueryValues = inferProcedures<TQueries>;
  type TMutationValues = inferProcedures<TMutations>;

  type ProviderContext = Omit<
    TRPCContextState<TRouter, TSSRContext>,
    "ssrState"
  > & {
    ssrState: Accessor<TRPCContextState<TRouter, TSSRContext>["ssrState"]>;
  };

  const Context = (config?.context ?? TRPCContext) as Context<ProviderContext>;
  const SolidQueryContext = config?.solidQueryContext as Context<
    QueryClient | undefined
  >;

  const createClient: CreateClient<TRouter> = (opts) => {
    return createTRPCClient(opts);
  };

  const TRPCProvider: TRPCProvider<TRouter, TSSRContext> = (props) => {
    const { abortOnUnmount = false, client, queryClient, ssrContext } = props;
    const [ssrState, setSSRState] = createSignal<SSRState>(
      props.ssrState ?? false
    );
    onMount(() => {
      // Only updating state to `mounted` if we are using SSR.
      // This makes it so we don't have an unnecessary re-render when opting out of SSR.
      setSSRState((state) => (state ? "mounted" : false));
    });
    return (
      <Context.Provider
        value={{
          abortOnUnmount,
          queryClient,
          client,
          ssrContext: ssrContext || null,
          ssrState,
          fetchQuery: (pathAndInput, opts) => {
            return queryClient.fetchQuery(
              getArrayQueryKey(pathAndInput),
              () => (client as any).query(...getClientArgs(pathAndInput, opts)),
              opts
            );
          },
          fetchInfiniteQuery: (pathAndInput, opts) => {
            return queryClient.fetchInfiniteQuery(
              getArrayQueryKey(pathAndInput),
              ({ pageParam }) => {
                const [path, input] = pathAndInput;
                const actualInput = { ...(input as any), cursor: pageParam };
                return (client as any).query(
                  ...getClientArgs([path, actualInput], opts)
                );
              },
              opts
            );
          },

          prefetchQuery: (pathAndInput, opts) => {
            return queryClient.prefetchQuery(
              getArrayQueryKey(pathAndInput),
              () => (client as any).query(...getClientArgs(pathAndInput, opts)),
              opts
            );
          },
          prefetchInfiniteQuery: (pathAndInput, opts) => {
            return queryClient.prefetchInfiniteQuery(
              getArrayQueryKey(pathAndInput),
              ({ pageParam }) => {
                const [path, input] = pathAndInput;
                const actualInput = { ...(input as any), cursor: pageParam };
                return (client as any).query(
                  ...getClientArgs([path, actualInput], opts)
                );
              },
              opts
            );
          },
          invalidateQueries: (...args: any[]) => {
            const [queryKey, ...rest] = args;
            return queryClient.invalidateQueries(
              getArrayQueryKey(queryKey),
              ...rest
            );
          },
          refetchQueries: (...args: any[]) => {
            const [queryKey, ...rest] = args;

            return queryClient.refetchQueries(
              getArrayQueryKey(queryKey),
              ...rest
            );
          },
          cancelQuery: (pathAndInput) => {
            return queryClient.cancelQueries(getArrayQueryKey(pathAndInput));
          },
          setQueryData: (...args) => {
            const [queryKey, ...rest] = args;
            return queryClient.setQueryData(
              getArrayQueryKey(queryKey),
              ...rest
            );
          },
          getQueryData: (...args) => {
            const [queryKey, ...rest] = args;

            return queryClient.getQueryData(
              getArrayQueryKey(queryKey),
              ...rest
            );
          },
          setInfiniteQueryData: (...args) => {
            const [queryKey, ...rest] = args;

            return queryClient.setQueryData(
              getArrayQueryKey(queryKey),
              ...rest
            );
          },
          getInfiniteQueryData: (...args) => {
            const [queryKey, ...rest] = args;

            return queryClient.getQueryData(
              getArrayQueryKey(queryKey),
              ...rest
            );
          },
        }}
      >
        <QueryClientProvider
          client={queryClient}
          {...((props.queryClientOpts ?? {}) as any)}
        >
          {props.children}
        </QueryClientProvider>
      </Context.Provider>
    );
  };

  function useContext() {
    return __useContext(Context);
  }

  /**
   * Hack to make sure errors return `status`='error` when doing SSR
   * @link https://github.com/trpc/trpc/pull/1645
   */
  function useSSRQueryOptionsIfNeeded<
    TOptions extends { retryOnMount?: boolean } | undefined
  >(pathAndInput: unknown[], opts: TOptions): TOptions {
    const { queryClient, ssrState } = useContext();
    return ssrState() &&
      ssrState() !== "mounted" &&
      queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput))?.state
        .status === "error"
      ? {
          retryOnMount: false,
          ...opts,
        }
      : opts;
  }

  function useQuery<
    TPath extends keyof TQueryValues & string,
    TQueryFnData = TQueryValues[TPath]["output"],
    TData = TQueryValues[TPath]["output"]
  >(
    pathAndInput: () => [
      path: TPath,
      ...args: inferHandlerInput<TQueries[TPath]>
    ],
    opts?: UseTRPCQueryOptions<
      TPath,
      TQueryValues[TPath]["input"],
      TQueryFnData,
      TData,
      TError
    >
  ): UseTRPCQueryResult<TData, TError> {
    const ctx = useContext();
    // createEffect(() => console.log("opts", opts?.()));
    if (
      typeof window === "undefined" &&
      ctx.ssrState() === "prepass" &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !ctx.queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput()))
    ) {
      void ctx.prefetchQuery(pathAndInput(), opts as any);
    }

    const shouldAbortOnUnmount = () =>
      opts?.trpc?.abortOnUnmount ?? ctx?.abortOnUnmount ?? false;
    const hook = __useQuery(
      () => getArrayQueryKey(pathAndInput()),
      (queryFunctionContext) => {
        const actualOpts = () => ({
          ...opts,
          trpc: {
            ...opts?.trpc,
            ...(shouldAbortOnUnmount()
              ? { signal: queryFunctionContext.signal }
              : {}),
          },
        });
        return (ctx.client as any).query(
          ...getClientArgs(pathAndInput(), actualOpts())
        );
      },
      opts as any
    ) as UseTRPCQueryResult<TData, TError>;
    hook.trpc = useHookResult({
      path: pathAndInput()[0],
    });
    return hook;
  }

  function useMutation<
    TPath extends keyof TMutationValues & string,
    TContext = unknown
  >(
    path: TPath | [TPath],
    opts?: UseTRPCMutationOptions<
      TMutationValues[TPath]["input"],
      TError,
      TMutationValues[TPath]["output"],
      TContext
    >
  ): UseTRPCMutationResult<
    TMutationValues[TPath]["output"],
    TError,
    TMutationValues[TPath]["input"],
    TContext
  > {
    const ctx = useContext();
    const queryClient = useQueryClient({ context: SolidQueryContext });

    const hook = __useMutation(
      (input) => {
        const actualPath = Array.isArray(path) ? path[0] : path;

        return (ctx.client.mutation as any)(
          ...getClientArgs([actualPath, input], opts)
        );
      },
      {
        context: SolidQueryContext,
        ...opts,
        onSuccess(...args) {
          const originalFn = () => opts?.onSuccess?.(...args);
          return mutationSuccessOverride({ originalFn, queryClient });
        },
      }
    ) as UseTRPCMutationResult<
      TMutationValues[TPath]["output"],
      TError,
      TMutationValues[TPath]["input"],
      TContext
    >;

    hook.trpc = useHookResult({
      path: Array.isArray(path) ? path[0] : path,
    });

    return hook;
  }

  /* istanbul ignore next */
  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  function useSubscription<
    TPath extends keyof TSubscriptions & string,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
  >(
    pathAndInput: () => [
      path: TPath,
      ...args: inferHandlerInput<TSubscriptions[TPath]>
    ],
    opts: UseTRPCSubscriptionOptions<
      inferObservableValue<inferProcedureOutput<TSubscriptions[TPath]>>,
      inferProcedureClientError<TSubscriptions[TPath]>
    >
  ) {
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
      const subscription = ctx.client.subscription<
        TRouter["_def"]["subscriptions"],
        TPath,
        TOutput,
        inferProcedureInput<TRouter["_def"]["subscriptions"][TPath]>
      >(pathAndInput()[0], (pathAndInput()[1] ?? undefined) as any, {
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

  function useInfiniteQuery<TPath extends TInfiniteQueryNames & string>(
    pathAndInput: () => [
      path: TPath,
      input: Omit<TQueryValues[TPath]["input"], "cursor">
    ],
    opts?: UseTRPCInfiniteQueryOptions<
      TPath,
      Omit<TQueryValues[TPath]["input"], "cursor">,
      TQueryValues[TPath]["output"],
      TError
    >
  ): UseTRPCInfiniteQueryResult<TQueryValues[TPath]["output"], TError> {
    const ctx = useContext();

    if (
      typeof window === "undefined" &&
      ctx.ssrState() === "prepass" &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !ctx.queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput()))
    ) {
      void ctx.prefetchInfiniteQuery(pathAndInput as any, opts as any);
    }

    const ssrOpts = useSSRQueryOptionsIfNeeded(pathAndInput(), opts);

    // request option should take priority over global
    const shouldAbortOnUnmount =
      opts?.trpc?.abortOnUnmount ?? ctx?.abortOnUnmount ?? false;

    const hook = __useInfiniteQuery(
      () => getArrayQueryKey(pathAndInput()),
      (queryFunctionContext) => {
        const actualOpts = () => ({
          ...ssrOpts,
          trpc: {
            ...ssrOpts?.trpc,
            ...(shouldAbortOnUnmount
              ? { signal: queryFunctionContext.signal }
              : {}),
          },
        });

        const actualInput = {
          ...((pathAndInput()[1] as any) ?? {}),
          cursor: queryFunctionContext.pageParam,
        };

        return (ctx.client as any).query(
          ...getClientArgs([pathAndInput()[0], actualInput], actualOpts())
        );
      },
      { context: SolidQueryContext, ...ssrOpts } as any
    ) as UseTRPCInfiniteQueryResult<TQueryValues[TPath]["output"], TError>;

    hook.trpc = useHookResult({
      path: pathAndInput()[0],
    });
    return hook;
  }
  const useDehydratedState: UseDehydratedState<TRouter> = (
    client,
    trpcState
  ) => {
    const transformed: Accessor<DehydratedState | undefined> = createMemo(
      () => {
        if (!trpcState) {
          return trpcState;
        }

        return client.runtime.transformer.deserialize(trpcState);
      }
    );
    return transformed;
  };

  return {
    Provider: TRPCProvider,
    createClient,
    useContext,
    useQuery,
    useMutation,
    useSubscription,
    useDehydratedState,
    useInfiniteQuery,
  };
}

/**
 * Hack to infer the type of `createReactQueryHooks`
 * @link https://stackoverflow.com/a/59072991
 */
class GnClass<TRouter extends AnyRouter, TSSRContext = unknown> {
  fn() {
    return createHooksInternal<TRouter, TSSRContext>();
  }
}

type returnTypeInferer<TType> = TType extends (
  a: Record<string, string>
) => infer U
  ? U
  : never;
type fooType<TRouter extends AnyRouter, TSSRContext = unknown> = GnClass<
  TRouter,
  TSSRContext
>["fn"];

/**
 * Infer the type of a `createSolidQueryHooks` function
 * @internal
 */
export type CreateSolidQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown
> = returnTypeInferer<fooType<TRouter, TSSRContext>>;
