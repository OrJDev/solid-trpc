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
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from "@trpc/server";
import {
  CreateInfiniteQueryOptions,
  CreateInfiniteQueryResult,
  CreateMutationOptions,
  CreateMutationResult,
  CreateQueryOptions,
  CreateQueryResult,
  createInfiniteQuery as __createInfiniteQuery,
  createMutation as __createMutation,
  createQuery as __createQuery,
} from "@tanstack/solid-query";
import {
  Context,
  createEffect,
  onCleanup,
  useContext as __useContext,
} from "solid-js";
import { TRPCContext, TRPCContextState } from "./types";
import { getClientArgs } from "./utils";

export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};

type OmitContext<T> = Omit<T, "context"> & {
  context?: TRPCRequestOptions["context"];
};

export interface CreateTRPCQueryOptions<TPath, TInput, TOutput, TData, TError>
  extends OmitContext<
      CreateQueryOptions<TOutput, TError, TData, () => [TPath, TInput]>
    >,
    TRPCRequestOptions {}

export interface CreateTRPCInfiniteQueryOptions<TPath, TInput, TOutput, TError>
  extends OmitContext<
      CreateInfiniteQueryOptions<
        TOutput,
        TError,
        TOutput,
        TOutput,
        () => [TPath, TInput]
      >
    >,
    TRPCRequestOptions {}

export interface CreateTRPCMutationOptions<
  TInput,
  TError,
  TOutput,
  TContext = unknown
> extends OmitContext<CreateMutationOptions<TOutput, TError, TInput, TContext>>,
    TRPCRequestOptions {}

type inferInfiniteQueryNames<
  TObj extends ProcedureRecord<any, any, any, any, any, any>
> = {
  [TPath in keyof TObj]: inferProcedureInput<TObj[TPath]> extends {
    cursor?: any;
  }
    ? TPath
    : never;
}[keyof TObj];

type inferProcedures<
  TObj extends ProcedureRecord<any, any, any, any, any, any>
> = {
  [TPath in keyof TObj]: {
    input: inferProcedureInput<TObj[TPath]>;
    output: inferProcedureOutput<TObj[TPath]>;
  };
};

export function createSolidQueryHooks<TRouter extends AnyRouter>() {
  type TQueries = TRouter["_def"]["queries"];
  type TSubscriptions = TRouter["_def"]["subscriptions"];
  type TError = TRPCClientErrorLike<TRouter>;
  type TInfiniteQueryNames = inferInfiniteQueryNames<TQueries>;

  type TQueryValues = inferProcedures<TRouter["_def"]["queries"]>;
  type TMutationValues = inferProcedures<TRouter["_def"]["mutations"]>;

  type ProviderContext = TRPCContextState<TRouter>;
  const Context = TRPCContext as Context<ProviderContext>;

  function createClient(
    opts: CreateTRPCClientOptions<TRouter>
  ): TRPCClient<TRouter> {
    return createTRPCClient(opts);
  }

  function useContext() {
    return __useContext(Context);
  }

  function createQuery<
    TPath extends keyof TQueryValues & string,
    TQueryFnData = TQueryValues[TPath]["output"],
    TData = TQueryValues[TPath]["output"]
  >(
    pathAndInput: () => [
      path: TPath,
      ...args: inferHandlerInput<TQueries[TPath]>
    ],
    opts?: CreateTRPCQueryOptions<
      TPath,
      TQueryValues[TPath]["input"],
      TQueryFnData,
      TData,
      TError
    >
  ): CreateQueryResult<TData, TError> {
    const ctx = useContext();
    if (
      typeof window === "undefined" &&
      opts?.enabled !== false &&
      !ctx.queryClient.getQueryCache().find(pathAndInput())
    ) {
      ctx.prefetchQuery(pathAndInput(), opts as any);
    }

    return __createQuery(pathAndInput, () =>
      (ctx.client as any).query(...getClientArgs(pathAndInput(), opts))
    );
  }

  function createMutation<
    TPath extends keyof TMutationValues & string,
    TContext = unknown
  >(
    path: () => TPath | [TPath],
    opts?: CreateTRPCMutationOptions<
      TMutationValues[TPath]["input"],
      TError,
      TMutationValues[TPath]["output"],
      TContext
    >
  ): CreateMutationResult<
    TMutationValues[TPath]["output"],
    TError,
    TMutationValues[TPath]["input"],
    TContext
  > {
    const ctx = useContext();
    return __createMutation((input) => {
      const curr = path();
      const actualPath = Array.isArray(curr) ? curr[0] : curr;
      return (ctx.client.mutation as any)(actualPath, input, opts);
    }, opts as any);
  }

  function createInfiniteQuery<TPath extends TInfiniteQueryNames & string>(
    pathAndInput: () => [
      path: TPath,
      input: Omit<TQueryValues[TPath]["input"], "cursor">
    ],
    opts?: CreateTRPCInfiniteQueryOptions<
      TPath,
      Omit<TQueryValues[TPath]["input"], "cursor">,
      TQueryValues[TPath]["output"],
      TError
    >
  ): CreateInfiniteQueryResult<TQueryValues[TPath]["output"], TError> {
    const [path, input] = pathAndInput();
    const ctx = useContext();

    if (
      typeof window === "undefined" &&
      opts?.enabled !== false &&
      !ctx.queryClient.getQueryCache().find(pathAndInput())
    ) {
      ctx.prefetchInfiniteQuery(pathAndInput() as any, opts as any);
    }

    return __createInfiniteQuery(
      pathAndInput as any,
      ({ pageParam }) => {
        const actualInput = { ...((input as any) ?? {}), cursor: pageParam };
        return (ctx.client as any).query(
          ...getClientArgs([path, actualInput], opts)
        );
      },
      opts as any
    );
  }
  function createSubscription<
    TPath extends keyof TSubscriptions & string,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
  >(
    pathAndInput: () => [
      path: TPath,
      ...args: inferHandlerInput<TSubscriptions[TPath]>
    ],
    opts: {
      enabled?: boolean;
      onError?: (err: TError) => void;
      onNext: (data: TOutput) => void;
    }
  ) {
    const enabled = opts?.enabled ?? true;
    const { client } = useContext();

    return createEffect(() => {
      if (!enabled) {
        return;
      }
      const [path, input] = pathAndInput();
      let isStopped = false;
      const unsub = client.subscription(path, (input ?? undefined) as any, {
        onError: (err) => {
          if (!isStopped) {
            opts.onError?.(err);
          }
        },
        onNext: (res) => {
          if (res.type === "data" && !isStopped) {
            opts.onNext(res.data);
          }
        },
      });
      onCleanup(() => {
        isStopped = true;
        unsub();
      });
    });
  }
  return {
    createClient,
    useContext,
    createQuery,
    createMutation,
    createInfiniteQuery,
    createSubscription,
  };
}

export { default as TRPCProvider } from "./provider";
