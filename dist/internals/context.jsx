import { createContext } from "solid-js";
export const contextProps = [
    "client",
    "abortOnUnmount",
];
export const TRPCContext = createContext(null);
