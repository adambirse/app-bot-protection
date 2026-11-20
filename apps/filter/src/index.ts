// Serverless entry point (Vercel detects a Hono app exported from src/index.ts).
// Azure Container Apps or any Node host can run src/server.ts instead.
import { waitUntil } from "@vercel/functions";
import { createFilterAppFromEnv } from "./from-env";

export default createFilterAppFromEnv({ waitUntil });
