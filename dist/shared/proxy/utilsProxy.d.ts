import type { CancelOptions, InfiniteData, InvalidateOptions, InvalidateQueryFilters, RefetchOptions, RefetchQueryFilters, SetDataOptions, Updater } from "@adeora/solid-query";
import { type TRPCClientError } from "@trpc/client";
import type { AnyQueryProcedure, AnyRouter, Filter, ProcedureOptions, inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import { type ProxyTRPCContextProps, type TRPCContextState, type TRPCFetchInfiniteQueryOptions, type TRPCFetchQueryOptions } from "../../internals/context";
type DecorateProcedure<TRouter extends AnyRouter, TProcedure extends AnyQueryProcedure> = {
    /**
     * @link https://react-query.tanstack.com/guides/prefetching
     */
    fetch(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TRouter>, inferProcedureOutput<TProcedure>>): Promise<inferProcedureOutput<TProcedure>>;
    /**
     * @link https://react-query.tanstack.com/guides/prefetching
     */
    fetchInfinite(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchInfiniteQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TRouter>, inferProcedureOutput<TProcedure>>): Promise<InfiniteData<inferProcedureOutput<TProcedure>>>;
    /**
     * @link https://react-query.tanstack.com/guides/prefetching
     */
    prefetch(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TRouter>, inferProcedureOutput<TProcedure>>): Promise<void>;
    /**
     * @link https://react-query.tanstack.com/guides/prefetching
     */
    prefetchInfinite(input: inferProcedureInput<TProcedure>, procedureOpts?: ProcedureOptions, opts?: TRPCFetchInfiniteQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TRouter>, inferProcedureOutput<TProcedure>>): Promise<void>;
    /**
     * @link https://react-query.tanstack.com/guides/query-invalidation
     */
    invalidate(input?: inferProcedureInput<TProcedure>, filters?: InvalidateQueryFilters, options?: InvalidateOptions): Promise<void>;
    /**
     * @link https://react-query.tanstack.com/reference/QueryClient#queryclientrefetchqueries
     */
    refetch(input?: inferProcedureInput<TProcedure>, filters?: RefetchQueryFilters, options?: RefetchOptions): Promise<void>;
    /**
     * @link https://react-query.tanstack.com/guides/query-cancellation
     */
    cancel(input?: inferProcedureInput<TProcedure>, options?: CancelOptions): Promise<void>;
    /**
     * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
     */
    setData(updater: Updater<inferProcedureOutput<TProcedure> | undefined, inferProcedureOutput<TProcedure> | undefined>, input?: inferProcedureInput<TProcedure>, options?: SetDataOptions): void;
    /**
     * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
     */
    setInfiniteData(updater: Updater<InfiniteData<inferProcedureOutput<TProcedure>> | undefined, InfiniteData<inferProcedureOutput<TProcedure>> | undefined>, input?: inferProcedureInput<TProcedure>, options?: SetDataOptions): void;
    /**
     * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
     */
    getData(input?: inferProcedureInput<TProcedure>): inferProcedureOutput<TProcedure> | undefined;
    /**
     * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
     */
    getInfiniteData(input?: inferProcedureInput<TProcedure>): InfiniteData<inferProcedureOutput<TProcedure>> | undefined;
};
/**
 * A type that will traverse all procedures and sub routers of a given router to create a union of
 * their possible input types
 */
type InferAllRouterQueryInputTypes<TRouter extends AnyRouter> = {
    [TKey in keyof Filter<TRouter["_def"]["record"], AnyRouter | AnyQueryProcedure>]: TRouter["_def"]["record"][TKey] extends AnyQueryProcedure ? inferProcedureInput<TRouter["_def"]["record"][TKey]> : InferAllRouterQueryInputTypes<TRouter["_def"]["record"][TKey]>;
}[keyof Filter<TRouter["_def"]["record"], AnyRouter | AnyQueryProcedure>];
/**
 * this is the type that is used to add in procedures that can be used on
 * an entire router
 */
type DecorateRouterProcedure<TRouter extends AnyRouter> = {
    /**
     * @link https://react-query.tanstack.com/guides/query-invalidation
     */
    invalidate(input?: Partial<InferAllRouterQueryInputTypes<TRouter>>, filters?: InvalidateQueryFilters, options?: InvalidateOptions): Promise<void>;
};
/**
 * @internal
 */
export type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> = {
    [TKey in keyof Filter<TRouter["_def"]["record"], AnyRouter | AnyQueryProcedure>]: TRouter["_def"]["record"][TKey] extends AnyRouter ? DecoratedProcedureUtilsRecord<TRouter["_def"]["record"][TKey]> & DecorateRouterProcedure<TRouter["_def"]["record"][TKey]> : DecorateProcedure<TRouter, TRouter["_def"]["record"][TKey]>;
} & DecorateRouterProcedure<TRouter>;
export type CreateSolidUtilsProxy<TRouter extends AnyRouter> = DecoratedProcedureUtilsRecord<TRouter> & ProxyTRPCContextProps<TRouter>;
/**
 * @internal
 */
export declare function createSolidQueryUtilsProxy<TRouter extends AnyRouter>(context: TRPCContextState<AnyRouter>): CreateSolidUtilsProxy<TRouter>;
export {};
