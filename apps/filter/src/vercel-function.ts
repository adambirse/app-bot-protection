// Vercel entry point. scripts/build-vercel.mjs bundles this file into a Node.js
// function with the Build Output API, so workspace packages are compiled in.
// Azure Container Apps or any other Node host runs src/node-server.ts instead.
import { getRequestListener } from "@hono/node-server";
import { waitUntil } from "@vercel/functions";
import { createFilterAppFromEnv } from "./from-env";

const app = createFilterAppFromEnv({ waitUntil });

export default getRequestListener(app.fetch);
