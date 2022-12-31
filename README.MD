# Solid tRPC

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

```tsx
// routes/example.tsx
import { trpc } from "./utils/trpc";
import { createSignal } from "solid-js";
const [name, setName] = createSignal("");
const res = trpc.queryName.useQuery(() => ({ name: name() })); // this will be called onMount and when name changes

export default function Example() {
   return (
        {...}
     )
}
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

## Output
To use the output of the query, you must remember to **not** destructure elements. Doing so violates the reactivity of the query result. This principle is general to Solid, please read more here https://github.com/solidjs/solid/discussions/408#discussioncomment-628486.

```ts
const { data, refetch...} = trpc.example.hello.useQuery(name()); // ❌ data will be evaluated only once and not update

const Navbar = () => {
  return <div>{data}</div>;
}

---

const queryRes = trpc.example.hello.useQuery(name()); // ✅ 

const Navbar = () => {
  return <div>{queryRes.data}</div>;
}

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

## Query Invalidation
To invalidate queries, please see the following example of using `utils` which come as part of the `trpc` object you created through `createTRPCSolid.`

```ts
// navbar.tsx
const queryRes = trpc.example.hello.useQuery(name()); // ✅ this will refetch on invalidation in footer.tsx

const Navbar = () => {
  return <div>{queryRes.data}</div>;
}
```

```ts
// another file - footer.tsx
const Footer = () => {
  const trpcUtils = trpc.useContext()
  
  const sayHelloAgain = () => {
    trpcUtils.example.hello.invalidate()
  }
  
  return <button onClick={sayHelloAgain}>say hello again</div>;
}

```

_Note: the official trpc docs use a different method for query invalidation : https://trpc.io/docs/v9/invalidateQueries_
