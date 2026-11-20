// Long-running Node server: local development, containers (Azure Container Apps), VMs.
import { serve } from "@hono/node-server";
import { createFilterAppFromEnv } from "./from-env";
import { FilterConfigError } from "./config";

let app;
try {
  app = createFilterAppFromEnv();
} catch (err) {
  if (err instanceof FilterConfigError) {
    console.error(`[filter] configuration error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

const port = Number(process.env.PORT ?? 3002);
const hostname = process.env.HOST ?? "127.0.0.1";
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`[filter] listening on http://${hostname}:${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
