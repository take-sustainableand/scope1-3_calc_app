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
    // chromium バイナリのバージョンと playwright 本体のバージョンがずれている環境のため、
    // Mac にインストール済みの Google Chrome を直接使う。
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe"
  }
});
