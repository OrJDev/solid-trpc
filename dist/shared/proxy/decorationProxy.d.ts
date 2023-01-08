import { type AnyRouter } from "@trpc/server";
import { type CreateSolidQueryHooks } from "../hooks/createHooksInternal";
/**
 * Create proxy for decorating procedures
 * @internal
 */
export declare function createSolidProxyDecoration<TRouter extends AnyRouter>(name: string, hooks: CreateSolidQueryHooks<TRouter>): unknown;
