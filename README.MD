# Solid tRPC - v10 - RC

## Getting Started

I recommend using [Create JD App](https://github.com/OrJDev/create-jd-app) but if you want to create a project from scratch, you can follow the steps below:

### Installation

```bash
npm install @trpc/client@10.0.0-rc.2 @trpc/server@10.0.0-rc.2 solid-trpc@next @tanstack/solid-query
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
// App.tsx
import { Component } from "solid-js";
import { client, trpc, queryClient } from "./utils/trpc"; // the client we created above
import Home from "./pages/Home"; // page for instance

interface IAppProps {}

const App: Component<IAppProps> = ({}) => {
  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <Home />
    </trpc.Provider>
  );
};

export default App;
```

### Example

```ts
import { trpc } from "./utils/trpc";
import { createSignal } from "solid-js";
const [name, setName] = createSignal("");
const res = trpc.queryName.useQuery(() => ({ name: name() })); // this will be called when name changes
```
