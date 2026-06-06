import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@liveseller/contracts": `${root}/packages/contracts/src/index.ts`
    }
  },
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: "dist"
  }
});
