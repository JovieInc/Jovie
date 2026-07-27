import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.AUDIO_PROOF_BASE_URL ?? 'http://localhost:3100';
const usesExternalServer = process.env.AUDIO_PROOF_EXTERNAL_SERVER === '1';

export default defineConfig({
  captureGitInfo: {
    commit: false,
    diff: false,
  },
  testDir: './tests/e2e',
  testMatch: 'audio-real-media-decoding.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 30_000,
  use: {
    baseURL,
    trace: process.env.CI ? 'off' : 'on-first-retry',
    video: 'off',
  },
  ...(usesExternalServer
    ? {}
    : {
        webServer: {
          command: 'pnpm run dev:fast',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 300_000,
          env: {
            NEXT_PUBLIC_E2E_MODE: '1',
            E2E_USE_TEST_AUTH_BYPASS: '1',
          },
        },
      }),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
