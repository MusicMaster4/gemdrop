import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:1427",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:1427",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
