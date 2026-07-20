import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3100';
}
process.env.DATABASE_URL ??= 'postgresql://localhost/noop';
process.env.E2E_CLERK_USER_ID ??= 'e2e-chat-timeline';
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??=
  'pk_test_mock-key-for-testing';
process.env.CLERK_SECRET_KEY ??= 'sk_test_mock-key-for-testing';
process.env.URL_ENCRYPTION_KEY ??= 'chat-production-smoke-url-encryption-key';
process.env.AI_GATEWAY_API_KEY ??= 'mock-ai-gateway-key';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  testMatch: /chat-timeline-regression\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'html',
  timeout: 180_000,
  expect: { timeout: 25_000 },
  use: {
    baseURL,
    trace: process.env.CI ? 'off' : 'on-first-retry',
    video: process.env.CI ? 'off' : 'retain-on-failure',
    storageState: { cookies: [], origins: [] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run build && pnpm run start',
    env: {
      NODE_ENV: 'production',
      PORT: managedWebServerUrl.port,
      NEXT_PUBLIC_E2E_MODE: '1',
      E2E_USE_TEST_AUTH_BYPASS: '1',
      NEXT_PUBLIC_CLERK_MOCK: '1',
      NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
      NEXT_DISABLE_TOOLBAR: '1',
      E2E_ALLOW_DEV_CSP: '1',
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS || ''} --max-old-space-size=8192`.trim(),
    },
    url: managedWebServerUrl.origin,
    reuseExistingServer: false,
    timeout: 420_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
