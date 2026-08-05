import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  use: { baseURL: "http://127.0.0.1:4173" },
  reporter: process.env.PERFORMANCE_REPORT
    ? [["line"], ["json", { outputFile: "test-results/performance-results.json" }]]
    : "list",
  webServer: {
    command: "npm run build && node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
