import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 90000,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'msedge',
      use: {
        browserName: 'chromium',
        channel: 'msedge',
        headless: true,
        storageState: 'playwright-auth-state.json',
      },
    },
  ],
});
