import { type AnyRouter } from "@trpc/server";
import { type CreateTRPCSolid } from "./createTRPCSolid";
import { type CreateTRPCSolidOptions } from "./shared";
import { type CreateSolidQueryHooks } from "./shared/hooks/createHooksInternal";
/**
 * @deprecated use `createTRPCSolid` instead
 */
export declare function createSolidQueryHooks<TRouter extends AnyRouter>(opts?: CreateTRPCSolidOptions<TRouter>): CreateSolidQueryHooks<TRouter> & {
    proxy: CreateTRPCSolid<TRouter>;
};
