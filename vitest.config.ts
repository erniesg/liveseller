import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@liveseller/contracts": `${root}packages/contracts/src/index.ts`,
      "@liveseller/prep": `${root}apps/prep/src/index.ts`,
      "@liveseller/runtime": `${root}apps/runtime/src/index.ts`
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx"
    ]
  }
});
