// Build the filter for Vercel using the Build Output API
// (https://vercel.com/docs/build-output-api): one bundled Node.js function that
// receives every request.
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";

const out = ".vercel/output";
const fn = `${out}/functions/filter.func`;

await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

await build({
  entryPoints: ["src/vercel-function.ts"],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});

await writeFile(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", supportsResponseStreaming: true }, null, 2),
);
await writeFile(`${fn}/package.json`, JSON.stringify({ type: "module" }));
await writeFile(
  `${out}/config.json`,
  JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/filter" }] }, null, 2),
);
