import { QueryClient } from "@tanstack/solid-query";
import { AnyRouter, MaybePromise } from "@trpc/server";
import Solid from "solid-js";

/**
 * @internal
 */
export interface UseMutationOverride {
  onSuccess: (opts: {
    /**
     * Calls the original function that was defined in the query's `onSuccess` option
     */
    originalFn: () => MaybePromise<unknown>;
    queryClient: QueryClient;
  }) => MaybePromise<unknown>;
}

/**
 * @internal
 */
export interface CreateTRPCSolidOptions<_TRouter extends AnyRouter> {
  /**
   * Override behaviors of the built-in hooks
   */
  unstable_overrides?: {
    useMutation?: Partial<UseMutationOverride>;
  };

  /**
   * Override the default context provider
   * @default undefined
   */
  context?: Solid.Context<any>;
  /**
   * Override the default React Query context
   * @default undefined
   */
  solidQueryContext?: Solid.Context<QueryClient | undefined>;
}
