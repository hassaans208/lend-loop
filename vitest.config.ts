import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    // Pure unit tests run in Node. Convex function tests opt into the
    // edge-runtime environment with a `@vitest-environment edge-runtime` comment,
    // which mirrors Convex's V8 isolate (Web Crypto, fetch, no Node built-ins).
    environment: "node",
    include: ["tests/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
