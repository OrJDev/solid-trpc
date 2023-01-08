## Solid tRPC

This is labled under the `ssr` tag because it is using `@adeora/solid-query` instead of `@tanstack/solid-query` - It is planned to be released under the tanstack org on version 5.

> recommended to use [Create JD App](https://github.com/orjdev/create-jd-app)

### Install

```bash
npm install solid-trpc@ssr @adeora/solid-query@latest
```

### Usage

#### tRPC Client

```ts
// utils/trpc.ts
import { QueryClient } from "@adeora/solid-query";
import { createTRPCSolid } from "solid-trpc";
import type { IAppRouter } from "~/server/trpc/router/_app";
import { httpBatchLink } from "@trpc/client";

const getBaseUrl = () => {
  if (typeof window !== "undefined") return "";
  return `http://localhost:${process.env.PORT ?? 3000}`;
};

export const trpc = createTRPCSolid<IAppRouter>();
export const client = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
    }),
  ],
});
export const queryClient = new QueryClient();
```

#### Root

```tsx
// root.tsx
// @refresh reload
import "./root.css";
import { Suspense } from "solid-js";
import {
  Body,
  ErrorBoundary,
  FileRoutes,
  Head,
  Html,
  Meta,
  Routes,
  Scripts,
  Title,
} from "solid-start";
import { trpc, client, queryClient } from "~/utils/trpc";
export default function Root() {
  return (
    <Html lang="en">
      <Head>
        <Title>Create JD App</Title>
        <Meta charset="utf-8" />
        <Meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Body>
        <trpc.Provider client={client} queryClient={queryClient}>
          <Suspense>
            <ErrorBoundary>
              <Routes>
                <FileRoutes />
              </Routes>
            </ErrorBoundary>
          </Suspense>
        </trpc.Provider>
        <Scripts />
      </Body>
    </Html>
  );
}
```

#### Query

```ts
const res = trpc.hello.useQuery(
  () => ({ name: "from tRPC" }),
  () => ({
    onSuccess: () => {
      console.log("hey");
    },
    refetchOnWindowFocus: num() != 0,
  })
);
```

#### Mutation

```tsx
const mut = trpc.random.useMutation();

return (
  <button
    onClick={() =>
      mut
        .mutateAsync({
          num: 1,
        })
        .then((res) => console.log(res))
    }
  >
    mutate
  </button>
);
```
