import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/stress',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: 'list',
  timeout: 900_000,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
