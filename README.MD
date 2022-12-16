# Solid tRPC - v10 - RC

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
const res = trpc.queryName.useQuery(() => ({ name: name() })); // this will be called onMount and when name changes
```

### Using Options

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

And options could be passed to all hooks.
