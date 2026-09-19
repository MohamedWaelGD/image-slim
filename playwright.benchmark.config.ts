import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/benchmarks',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: 'list',
  timeout: 600_000,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: {
      args: ['--enable-precise-memory-info'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
