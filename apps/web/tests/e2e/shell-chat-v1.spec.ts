/**
 * E2E smoke: the production authenticated shell can render the Shell + Chat V1
 * frame when the dev override forces `SHELL_CHAT_V1`.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-chat-v1.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';

test.use({ storageState: { cookies: [], origins: [] } });

async function gotoChatRoute(page: Page) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto('/app/chat', {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        attempt < maxAttempts && /ERR_EMPTY_RESPONSE|ECONNRESET/i.test(message);

      if (!shouldRetry) {
        throw error;
      }

      await page.waitForTimeout(1000 * attempt);
    }
  }
}

test('chat route renders the Shell V1 app frame when forced on', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  const overrides = JSON.stringify({
    [APP_FLAG_OVERRIDE_KEYS.SHELL_CHAT_V1]: true,
  });

  await page.addInitScript(
    ({ cookieName, key, value }) => {
      localStorage.setItem(key, value);
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    },
    {
      cookieName: APP_FLAG_OVERRIDES_COOKIE,
      key: FF_OVERRIDES_KEY,
      value: overrides,
    }
  );

  await setTestAuthBypassSession(page, 'creator-ready');
  await gotoChatRoute(page);
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  await expect(page.locator('[data-shell-design="shellChatV1"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="chat-content"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="chat-composer-surface"]')).toHaveCSS(
    'border-radius',
    /999px|18px|20px|24px/
  );
});
