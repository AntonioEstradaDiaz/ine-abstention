import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "node tests/fixtures/auth-server.mjs",
    url: "http://127.0.0.1:54321/health",
    reuseExistingServer: false,
  },
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: process.env.FRONTEND_URL || "http://127.0.0.1:3000",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: "**/auth.setup.ts",
      use: { launchOptions: { args: ["--enable-unsafe-swiftshader"] } },
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        storageState: ".playwright/auth/user.json",
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        launchOptions: { args: ["--enable-unsafe-swiftshader"] },
      },
    },
  ],
});
