// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const PORT = 8001;

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } }
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe"
  }
});
