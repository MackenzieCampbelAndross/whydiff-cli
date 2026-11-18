import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 45000,
    hookTimeout: 45000,
    pool: "forks"
  },
  resolve: {
    alias: {
      "@whydiff/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@whydiff/test-utils": path.resolve(__dirname, "packages/test-utils/src/index.ts"),
      "@whydiff/cli": path.resolve(__dirname, "packages/cli/src/index.ts")
    }
  }
});
