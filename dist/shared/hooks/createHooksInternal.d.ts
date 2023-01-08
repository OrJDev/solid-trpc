import { type DehydratedState, type CreateInfiniteQueryResult, type CreateMutationOptions, type CreateMutationResult, type CreateQueryResult, type QueryClientProviderProps } from "@adeora/solid-query";
import { type CreateTRPCClientOptions, type TRPCClient, type TRPCClientErrorLike } from "@trpc/client";
import type { AnyRouter, ProcedureRecord, inferHandlerInput, inferProcedureClientError, inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import { type inferObservableValue } from "@trpc/server/observable";
import { type Accessor, type JSX } from "solid-js";
import { type TRPCContextProps, type TRPCContextState } from "../../internals/context";
import { type CreateTRPCSolidOptions } from "../types";
import { type UseTRPCQueryOptions, type UseTRPCInfiniteQueryOptions, type TRPCUseQueryBaseOptions } from "./types";
export type OutputWithCursor<TData, TCursor = any> = {
    cursor: TCursor | null;
    data: TData;
};
export type { TRPCContext, TRPCContextState } from "../../internals/context";
export interface UseTRPCMutationOptions<TInput, TError, TOutput, TContext = unknown> extends CreateMutationOptions<TOutput, TError, TInput, TContext>, TRPCUseQueryBaseOptions {
}
export interface UseTRPCSubscriptionOptions<TOutput, TError> {
    enabled?: boolean;
    onStarted?: () => void;
    onData: (data: TOutput) => void;
    onError?: (err: TError) => void;
}
type inferInfiniteQueryNames<TObj extends ProcedureRecord> = {
    [TPath in keyof TObj]: inferProcedureInput<TObj[TPath]> extends {
        cursor?: any;
    } ? TPath : never;
}[keyof TObj];
type inferProcedures<TObj extends ProcedureRecord> = {
    [TPath in keyof TObj]: {
        input: inferProcedureInput<TObj[TPath]>;
        output: inferProcedureOutput<TObj[TPath]>;
    };
};
export interface TRPCProviderProps<TRouter extends AnyRouter> extends TRPCContextProps<TRouter> {
    children: JSX.Element;
}
export type TRPCProvider<TRouter extends AnyRouter> = (props: TRPCProviderProps<TRouter> & {
    queryClientOpts?: Omit<QueryClientProviderProps, "client">;
}) => JSX.Element;
export type UseDehydratedState<TRouter extends AnyRouter> = (client: TRPCClient<TRouter>, trpcState: DehydratedState | undefined) => Accessor<DehydratedState | undefined>;
export type CreateClient<TRouter extends AnyRouter> = (opts: CreateTRPCClientOptions<TRouter>) => TRPCClient<TRouter>;
interface TRPCHookResult {
    trpc: {
        path: string;
    };
}
/**
 * @internal
 */
export type UseTRPCQueryResult<TData, TError> = CreateQueryResult<TData, TError> & TRPCHookResult;
/**
 * @internal
 */
export type UseTRPCInfiniteQueryResult<TData, TError> = CreateInfiniteQueryResult<TData, TError> & TRPCHookResult;
/**
 * @internal
 */
export type UseTRPCMutationResult<TData, TError, TVariables, TContext> = CreateMutationResult<TData, TError, TVariables, TContext> & TRPCHookResult;
/**
 * Create strongly typed react hooks
 * @internal
 */
export declare function createHooksInternal<TRouter extends AnyRouter>(config?: CreateTRPCSolidOptions<TRouter>): {
    Provider: TRPCProvider<TRouter>;
    createClient: CreateClient<TRouter>;
    useContext: () => TRPCContextState<TRouter>;
    useQuery: <TPath extends keyof TRouter["_def"]["queries"] & string, TQueryFnData = inferProcedures<TRouter["_def"]["queries"]>[TPath]["output"], TData = inferProcedures<TRouter["_def"]["queries"]>[TPath]["output"]>(pathAndInput: () => [path: TPath, ...args: import("@trpc/server").ProcedureArgs<import("@trpc/server").inferProcedureParams<TRouter["_def"]["queries"][TPath]>>], opts?: UseTRPCQueryOptions<TPath, inferProcedures<TRouter["_def"]["queries"]>[TPath]["input"], TQueryFnData, TData, TRPCClientErrorLike<TRouter>> | undefined) => UseTRPCQueryResult<TData, TRPCClientErrorLike<TRouter>>;
    useMutation: <TPath_1 extends keyof TRouter["_def"]["mutations"] & string, TContext = unknown>(path: TPath_1 | [TPath_1], opts?: UseTRPCMutationOptions<inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["input"], TRPCClientErrorLike<TRouter>, inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["output"], TContext> | undefined) => UseTRPCMutationResult<inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["output"], TRPCClientErrorLike<TRouter>, inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["input"], TContext>;
    useSubscription: <TPath_2 extends keyof TRouter["_def"]["subscriptions"] & string, TOutput extends inferObservableValue<inferProcedureOutput<TRouter["_def"]["subscriptions"][TPath_2]>>>(pathAndInput: () => [path: TPath_2, ...args: import("@trpc/server").ProcedureArgs<import("@trpc/server").inferProcedureParams<TRouter["_def"]["subscriptions"][TPath_2]>>], opts: UseTRPCSubscriptionOptions<inferObservableValue<inferProcedureOutput<TRouter["_def"]["subscriptions"][TPath_2]>>, inferProcedureClientError<TRouter["_def"]["subscriptions"][TPath_2]>>) => void;
    useInfiniteQuery: <TPath_3 extends inferInfiniteQueryNames<TRouter["_def"]["queries"]> & string>(pathAndInput: () => [path: TPath_3, input: Omit<inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["input"], "cursor">], opts?: UseTRPCInfiniteQueryOptions<TPath_3, Omit<inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["input"], "cursor">, inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["output"], TRPCClientErrorLike<TRouter>> | undefined) => UseTRPCInfiniteQueryResult<inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["output"], TRPCClientErrorLike<TRouter>>;
};
/**
 * Hack to infer the type of `createReactQueryHooks`
 * @link https://stackoverflow.com/a/59072991
 */
declare class GnClass<TRouter extends AnyRouter> {
    fn(): {
        Provider: TRPCProvider<TRouter>;
        createClient: CreateClient<TRouter>;
        useContext: () => TRPCContextState<TRouter>;
        useQuery: <TPath extends keyof TRouter["_def"]["queries"] & string, TQueryFnData = inferProcedures<TRouter["_def"]["queries"]>[TPath]["output"], TData = inferProcedures<TRouter["_def"]["queries"]>[TPath]["output"]>(pathAndInput: () => [path: TPath, ...args: import("@trpc/server").ProcedureArgs<import("@trpc/server").inferProcedureParams<TRouter["_def"]["queries"][TPath]>>], opts?: UseTRPCQueryOptions<TPath, inferProcedures<TRouter["_def"]["queries"]>[TPath]["input"], TQueryFnData, TData, TRPCClientErrorLike<TRouter>> | undefined) => UseTRPCQueryResult<TData, TRPCClientErrorLike<TRouter>>;
        useMutation: <TPath_1 extends keyof TRouter["_def"]["mutations"] & string, TContext = unknown>(path: TPath_1 | [TPath_1], opts?: UseTRPCMutationOptions<inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["input"], TRPCClientErrorLike<TRouter>, inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["output"], TContext> | undefined) => UseTRPCMutationResult<inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["output"], TRPCClientErrorLike<TRouter>, inferProcedures<TRouter["_def"]["mutations"]>[TPath_1]["input"], TContext>;
        useSubscription: <TPath_2 extends keyof TRouter["_def"]["subscriptions"] & string, TOutput extends inferObservableValue<inferProcedureOutput<TRouter["_def"]["subscriptions"][TPath_2]>>>(pathAndInput: () => [path: TPath_2, ...args: import("@trpc/server").ProcedureArgs<import("@trpc/server").inferProcedureParams<TRouter["_def"]["subscriptions"][TPath_2]>>], opts: UseTRPCSubscriptionOptions<inferObservableValue<inferProcedureOutput<TRouter["_def"]["subscriptions"][TPath_2]>>, inferProcedureClientError<TRouter["_def"]["subscriptions"][TPath_2]>>) => void;
        useInfiniteQuery: <TPath_3 extends inferInfiniteQueryNames<TRouter["_def"]["queries"]> & string>(pathAndInput: () => [path: TPath_3, input: Omit<inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["input"], "cursor">], opts?: UseTRPCInfiniteQueryOptions<TPath_3, Omit<inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["input"], "cursor">, inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["output"], TRPCClientErrorLike<TRouter>> | undefined) => UseTRPCInfiniteQueryResult<inferProcedures<TRouter["_def"]["queries"]>[TPath_3]["output"], TRPCClientErrorLike<TRouter>>;
    };
}
type returnTypeInferer<TType> = TType extends (a: Record<string, string>) => infer U ? U : never;
type fooType<TRouter extends AnyRouter> = GnClass<TRouter>["fn"];
/**
 * Infer the type of a `createSolidQueryHooks` function
 * @internal
 */
export type CreateSolidQueryHooks<TRouter extends AnyRouter> = returnTypeInferer<fooType<TRouter>>;
