import { QueryClient, type QueryClientConfig } from "@adeora/solid-query";
/**
 * @internal
 */
export type CreateTRPCSolidQueryClientConfig = {
    queryClient?: QueryClient;
    queryClientConfig?: never;
} | {
    queryClientConfig?: QueryClientConfig;
    queryClient?: never;
};
/**
 * @internal
 */
export declare const getQueryClient: (config: CreateTRPCSolidQueryClientConfig) => QueryClient;
