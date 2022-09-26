import {
  QueryClient,
  QueryClientProvider,
  QueryClientProviderProps,
} from "@tanstack/solid-query";
import { TRPCClient } from "@trpc/client";
import { AnyRouter } from "@trpc/server";
import { Context, JSX } from "solid-js";
import { TRPCContext, TRPCContextState } from "./types";
import { getClientArgs } from "./utils";

export default function TRPCProvider<TRouter extends AnyRouter>(props: {
  queryClient: QueryClient;
  client: TRPCClient<TRouter>;
  children: JSX.Element;
  queryClientOpts?: Omit<QueryClientProviderProps, "client">;
}) {
  const Context = TRPCContext as Context<TRPCContextState<TRouter>>;
  return (
    <Context.Provider
      value={{
        queryClient: props.queryClient,
        client: props.client,
        fetchQuery: (pathAndInput, opts) =>
          props.queryClient.fetchQuery(
            pathAndInput,
            () =>
              (props.client as any).query(...getClientArgs(pathAndInput, opts)),
            opts
          ),
        fetchInfiniteQuery: (pathAndInput, opts) =>
          props.queryClient.fetchInfiniteQuery(
            pathAndInput,
            ({ pageParam }) => {
              const [path, input] = pathAndInput;
              const actualInput = { ...(input as any), cursor: pageParam };
              return (props.client as any).query(
                ...getClientArgs([path, actualInput], opts)
              );
            },
            opts
          ),
        prefetchQuery: (pathAndInput, opts) =>
          props.queryClient.prefetchQuery(
            pathAndInput,
            () =>
              (props.client as any).query(...getClientArgs(pathAndInput, opts)),
            opts
          ),
        prefetchInfiniteQuery: (pathAndInput, opts) =>
          props.queryClient.prefetchInfiniteQuery(
            pathAndInput,
            ({ pageParam }) => {
              const [path, input] = pathAndInput;
              const actualInput = { ...(input as any), cursor: pageParam };
              return (props.client as any).query(
                ...getClientArgs([path, actualInput], opts)
              );
            },
            opts
          ),
        /**
         * @deprecated use `invalidateQueries`
         */
        invalidateQuery: (...args: any[]) =>
          props.queryClient.invalidateQueries(...args),
        invalidateQueries: (...args: any[]) =>
          props.queryClient.invalidateQueries(...args),
        refetchQueries: (...args: any[]) =>
          props.queryClient.refetchQueries(...args),
        cancelQuery: (pathAndInput) =>
          props.queryClient.cancelQueries(pathAndInput),
        setQueryData: (...args) => props.queryClient.setQueryData(...args),
        getQueryData: (...args) => props.queryClient.getQueryData(...args),
        setInfiniteQueryData: (...args) =>
          props.queryClient.setQueryData(...args),
        getInfiniteQueryData: (...args) =>
          props.queryClient.getQueryData(...args),
      }}
    >
      <QueryClientProvider
        client={props.queryClient}
        {...((props.queryClientOpts ?? {}) as any)}
      >
        {props.children}
      </QueryClientProvider>
    </Context.Provider>
  );
}
