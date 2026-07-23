/**
 * E2E smoke: stale retired shell overrides cannot restore the legacy frame.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-chat-v1-flag-off.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { gotoAuthenticatedChatRoute } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test('chat route ignores a stale DESIGN_V1 override and renders the canonical shell', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(300_000);

  const overrides = JSON.stringify({
    'code:DESIGN_V1': false,
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
  await gotoAuthenticatedChatRoute(page);

  const frame = page.locator('[data-app-shell-frame="true"]');
  await expect(frame).toBeVisible({
    timeout: 30_000,
  });
  await expect(frame).not.toHaveAttribute('data-shell-design');
  await expect(page.locator('main#main-content')).toHaveClass(
    /lg:rounded-\(--app-shell-radius\)/
  );
});
