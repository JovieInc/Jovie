/**
 * E2E smoke (parity): the authenticated shell still renders the legacy frame
 * when DESIGN_V1 is forced off via the override cookie + localStorage.
 *
 * This pairs with `shell-chat-v1.spec.ts`, which proves the flag-on path.
 * Together they catch regressions in either direction so we never ship a
 * change that only works under one flag value.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-chat-v1-flag-off.spec.ts --project=chromium
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

test('chat route renders the legacy shell frame when DESIGN_V1 is forced off', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  // DESIGN_V1 and SHELL_CHAT_V1 both map to the `code:DESIGN_V1` override
  // slot in APP_FLAG_OVERRIDE_KEYS, so a single override entry forces every
  // New Design alias off in lockstep.
  const overrides = JSON.stringify({
    [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: false,
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

  // The legacy shell frame still mounts and stays interactive even when the
  // New Design override is off. We assert by attribute rather than by the
  // absence of the New Design selector so the failure message clearly says
  // "expected legacy, got X".
  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-shell-design="legacy"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-shell-design="shellChatV1"]')).toHaveCount(
    0
  );
});
