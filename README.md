> recommended to use [Create JD App](https://github.com/orjdev/create-jd-app)

> Moved to [Here](https://mediakit-taupe.vercel.app/trpc/install)

### Install

```bash
npm install solid-trpc@start-ssr @tanstack/solid-query@beta
```

### Usage

#### tRPC Client

```ts
// utils/trpc.ts
import { QueryClient } from "@tanstack/solid-query";
import type { IAppRouter } from "~/server/trpc/router/_app";
import { createTRPCSolidStart } from "solid-trpc";
import { httpBatchLink } from "@trpc/client";
import { isServer } from "solid-js/web";

const getBaseUrl = () => {
  if (typeof window !== "undefined") return "";
  return `http://localhost:${process.env.PORT ?? 5173}`;
};

export const trpc = createTRPCSolidStart<IAppRouter>({
  config(event) {
    // PageEvent of Solid-start
    return {
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers: () => {
            if (isServer && event?.request) {
              // do something
            }
            return {};
          },
        }),
      ],
    };
  },
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
import { trpc, queryClient } from "~/utils/trpc";
export default function Root() {
  return (
    <Html lang="en">
      <Head>
        <Title>Create JD App</Title>
        <Meta charset="utf-8" />
        <Meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Body>
        <trpc.Provider queryClient={queryClient}>
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
