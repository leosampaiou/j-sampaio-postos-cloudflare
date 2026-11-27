import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import "./redesign.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        try {
          const csrf = sessionStorage.getItem("jsampaio-csrf");
          return csrf ? { "x-csrf-token": csrf } : {};
        } catch {
          return {};
        }
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          cache: "no-store",
        });
      },
    }),
  ],
});

window.addEventListener("pagehide", event => {
  if (!event.persisted) return;
  queryClient.clear();
  document.documentElement.style.visibility = "hidden";
});
window.addEventListener("pageshow", event => {
  if (event.persisted) window.location.reload();
  else document.documentElement.style.removeProperty("visibility");
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
