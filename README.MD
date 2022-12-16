# Solid tRPC - v10

## Getting Started

I recommend using [Create JD App](https://github.com/OrJDev/create-jd-app) but if you want to create a project from scratch, you can follow the steps below:

### Installation

```bash
npm install @trpc/client @trpc/server solid-trpc@next @tanstack/solid-query
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
// entry-client.tsx
import { mount, StartClient } from "solid-start/entry-client";
import { client, queryClient, trpc } from "./utils/trpc";

mount(
  () => (
    <trpc.Provider client={client} queryClient={queryClient}>
        <StartClient />
    </trpc.Provider>
  ),
  document
);
```

### Example

```ts
// routes/example.tsx
import { trpc } from "./utils/trpc";
import { createSignal } from "solid-js";
const [name, setName] = createSignal("");
const res = trpc.queryName.useQuery(() => ({ name: name() })); // this will be called onMount and when name changes
```

### Reactivity


## Input

Solid tRPC input is considered to be a Solid accessor, meaning that you are required to pass a callback and SQ will rerun the tRPC endpoint whenever the signal changes.

```ts
const [name, setName] = createSignal("John");
trpc.example.hello.useQuery(name); // ✅
trpc.example.hello.useQuery(name()); // ❌
trpc.example.useQuery(()=> name().slice(1)); // ✅
// or even
trpc.example.useQuery(()=> "John"); // ✅ will be called once
```

## Enabled Property 

If you are using the `enabled` property make sure you follow Solid Query rules:

```ts
const [enabled, setEnabled] = createSignal(false);
const query = trpc.queryName.useQuery(() => "hey there", {
  // ❌ passing a signal directly is not reactive
  // enabled: enabled(),

  // ✅ passing a function that returns a signal is reactive
  get enabled() {
    return enabled();
  },
});
```
