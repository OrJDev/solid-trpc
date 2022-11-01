# SolidJS tRPC

[If you are looking for tRPC v10 / RC check out the next branch](https://github.com/OrJDev/solid-trpc/tree/next)

## What is different

- Replace "use" with "create" (e.g. useQuery -> createQuery)
- Query paths (key and input) are being treated as Solid Accessor (callback):

```ts
//  instead of a string:
useQuery(["MyKey", {...}])

// it becomes a callback:
createQuery(()=> ["MyKey", {...}])
```

## Getting Started

I recommend using [Create JD App](https://github.com/OrJDev/create-jd-app) but if you want to create a project from scratch, you can follow the steps below:

### Installation

```bash
npm install solid-trpc @tanstack/solid-query
```

### Creating A Client

```ts
// utils/trpc.ts
import { createSolidQueryHooks } from "solid-trpc";
import { IAppRouter } from "api/src/routers/_route"; // your trpc appRouter type

export const trpc = createSolidQueryHooks<IAppRouter>();
export const client = trpc.createClient({
  url: "/api/trpc", // your trpc server url
});
```

### TRPC Provider

```tsx
// App.tsx
import { QueryClient } from "@tanstack/solid-query";
import { Component } from "solid-js";
import { TRPCProvider } from "solid-trpc";
import { client } from "./utils/trpc"; // the client we created above
import Home from "./pages/Home"; // any page that uses trpc

interface IAppProps {}

const queryClient = new QueryClient();
const App: Component<IAppProps> = ({}) => {
  return (
    <TRPCProvider client={client} queryClient={queryClient}>
      <Home />
    </TRPCProvider>
  );
};

export default App;
```

### Queries

```tsx
// pages/Home.tsx
import { Component } from "solid-js";
import { trpc } from "../utils/trpc";

interface IHomeProps {}

const Home: Component<IHomeProps> = ({}) => {
  const test = trpc.createQuery(() => ["example.test", { name: "example" }]);

  return (
    <div>
      <h1>{test.data ?? "no data || yet"}</h1>
    </div>
  );
};

export default Home;
```

### Mutations

```tsx
// pages/Home.tsx
import { Component, onMount } from "solid-js";
import { trpc } from "../utils/trpc";

interface IHomeProps {}

const Home: Component<IHomeProps> = ({}) => {
  const test = trpc.createMutation(() => "example.mTest");

  onMount(() => {
    test.mutateAsync({ number: 3 });
  });

  return (
    <div>
      <h1>{test.data ?? "no data || yet"}</h1>
    </div>
  );
};

export default Home;
```
