import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  use: { baseURL: "http://127.0.0.1:4174" },
  reporter: process.env.PERFORMANCE_REPORT
    ? [["line"], ["json", { outputFile: "test-results/performance-results.json" }]]
    : "list",
  webServer: {
    command: "node scripts/playwright-server.mjs",
    env: {
      VITE_API_BASE_URL: "https://api.test",
      VITE_API_URL: "https://api.test",
    },
    port: 4174,
    reuseExistingServer: false,
  },
});
