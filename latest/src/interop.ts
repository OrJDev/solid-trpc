// interop:
import { type AnyRouter } from "@trpc/server";
import {
  type CreateTRPCSolid,
  createHooksInternalProxy,
} from "./createTRPCSolid";
import { type CreateTRPCSolidOptions } from "./shared";
import {
  type CreateSolidQueryHooks,
  createHooksInternal,
} from "./shared/hooks/createHooksInternal";

/**
 * @deprecated use `createTRPCSolid` instead
 */
export function createSolidQueryHooks<TRouter extends AnyRouter>(
  opts?: CreateTRPCSolidOptions<TRouter>
): CreateSolidQueryHooks<TRouter> & {
  proxy: CreateTRPCSolid<TRouter>;
} {
  const trpc = createHooksInternal<TRouter>(opts);
  const proxy = createHooksInternalProxy<TRouter>(trpc);

  return {
    ...trpc,
    proxy,
  };
}
