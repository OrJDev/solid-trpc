# Solid tRPC

## Getting Started

I recommend using [Create JD App](https://github.com/OrJDev/create-jd-app) but if you want to create a project from scratch, you can follow the steps below:

### Installation

```bash
npm install @trpc/client@next @trpc/server@next solid-trpc@next @tanstack/solid-query@beta
```

### Creating A Client

```ts
// utils/trpc.ts
import { IAppRouter } from "@/whereMyRouterAt"; // your router type
import { createTRPCSolid } from "solid-trpc";
import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/solid-query";

export const trpc = createTRPCSolid<IAppRouter>();
export const client = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
    }),
  ],
});
export const queryClient = new QueryClient();
```

### TRPC Provider

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
import { trpc, queryClient, client } from "~/utils/trpc";
export default function Root() {
  return (
    <Html lang="en">
      <Head>
        <Title>Create JD App</Title>
        <Meta charset="utf-8" />
        <Meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Body>
        <trpc.Provider queryClient={queryClient} client={client}>
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

### Example

```tsx
// routes/example.tsx
import { trpc } from "./utils/trpc";
import { createSignal } from "solid-js";
const [name, setName] = createSignal("");
const res = trpc.queryName.useQuery(() => ({ name: name() }));
// this will be called onMount and when name changes

export default function Example() {
   return (
        {...}
     )
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
