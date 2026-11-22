import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: `npm test` (once) or `npm run test:watch`.
// Pure logic runs in Node; component tests opt into jsdom with a `@vitest-environment jsdom` comment.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next's guard against importing server code in the browser; a no-op in tests.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
