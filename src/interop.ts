// interop:
import { AnyRouter } from "@trpc/server";
import { CreateTRPCSolid, createHooksInternalProxy } from "./createTRPCSolid";
import { CreateTRPCSolidOptions } from "./shared";
import {
  CreateReactQueryHooks,
  createHooksInternal,
} from "./shared/hooks/createHooksInternal";

/**
 * @deprecated use `createTRPCSolid` instead
 */
export function createReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown
>(
  opts?: CreateTRPCSolidOptions<TRouter>
): CreateReactQueryHooks<TRouter, TSSRContext> & {
  proxy: CreateTRPCSolid<TRouter, TSSRContext>;
} {
  const trpc = createHooksInternal<TRouter, TSSRContext>(opts);
  const proxy = createHooksInternalProxy<TRouter, TSSRContext>(trpc);

  return {
    ...trpc,
    proxy,
  };
}
