// Serverless entry point. Vercel detects a Hono app exported from src/index.ts (the
// file itself must import hono). Azure Container Apps or any Node host can run
// src/node-server.ts instead.
import { Hono } from "hono";
import { waitUntil } from "@vercel/functions";
import { createFilterAppFromEnv } from "./from-env";

const filter = createFilterAppFromEnv({ waitUntil });
const app = new Hono();
app.all("*", (c) => filter.fetch(c.req.raw));

export default app;
