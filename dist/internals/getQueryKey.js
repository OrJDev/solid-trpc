/**
 * We treat `undefined` as an input the same as omitting an `input`
 * https://github.com/trpc/trpc/issues/2290
 */
export function getQueryKey(path, input) {
    return input === undefined ? [path] : [path, input];
}
