import { defineConfig, devices } from '@playwright/test';

/**
 * Path-filtered PR gate. Renders HTML documents in Chromium.
 * No web server, no Doppler, no full E2E project.
 */
export default defineConfig({
  testDir: './tests/a11y',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
