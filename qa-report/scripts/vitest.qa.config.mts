import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../vitest.config.mjs";

// QA-only harnesses: run the real route and storage code with controlled fakes.
// npx vitest run --config qa-report/scripts/vitest.qa.config.mts
export default mergeConfig(base, defineConfig({ test: { include: ["qa-report/scripts/**/*.qa.test.ts"], setupFiles: ["./test/setup.ts"] } }));
