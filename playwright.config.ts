import { defineConfig, devices } from '@playwright/test';

const webBaseUrl = process.env.WEB_BASE_URL;

export default defineConfig({
  testDir: './apps/client/e2e',
  outputDir: './test-results/playwright',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: webBaseUrl || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: webBaseUrl
    ? undefined
    : {
        command: 'node scripts/serve-client.mjs',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
