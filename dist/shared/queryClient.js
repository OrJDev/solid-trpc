import { QueryClient } from "@adeora/solid-query";
/**
 * @internal
 */
export const getQueryClient = (config) => config.queryClient ?? new QueryClient(config.queryClientConfig);
