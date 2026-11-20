import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/filter/**/*.test.ts"],
    fileParallelism: false,
  },
});
