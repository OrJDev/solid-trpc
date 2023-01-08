/**
 * We treat `undefined` as an input the same as omitting an `input`
 * https://github.com/trpc/trpc/issues/2290
 */
export declare function getQueryKey(path: string, input: unknown): [string] | [string, unknown];
