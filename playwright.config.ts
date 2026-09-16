import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["apps/**/*.e2e.ts"],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm --workspace @liveseller/runtime run dev",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: true,
      timeout: 20_000
    },
    {
      command: "npm --workspace @liveseller/overlay run dev -- --host 127.0.0.1 --port 5175",
      url: "http://127.0.0.1:5175/",
      reuseExistingServer: true,
      timeout: 20_000
    }
  ]
});
