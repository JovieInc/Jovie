/**
 * E2E: /hud?fs=1 stays admin-gated (JOV-7126 follow-up).
 *
 * `?fs=1` was added to next.config.js's `/hud` rewrite `missing` array so
 * the hud-isolated screen-cert producer can reach the isolated
 * apps/web/app/hud/page.tsx source directly instead of being silently
 * rewritten to the app-shell-wrapped /app/ov/hud screen. That rewrite
 * change only picks which of two pages renders — both are gated by the
 * same getCurrentAdminPageAccess() check in app/hud/page.tsx — but the
 * whole point of the change is that it must not become a way to reach an
 * ungated copy of the HUD. This proves the page itself still denies a
 * request with no admin session, regardless of which rewrite path got it
 * there.
 */

import { expect, test } from '@playwright/test';

test.describe('hud-isolated admin gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('denies an unauthenticated request to /hud?fs=1', async ({ page }) => {
    const response = await page.goto('/hud?fs=1', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).not.toBe(200);
    // Next.js's unauthorized()/forbidden() (no local unauthorized.tsx or
    // forbidden.tsx under app/hud or app/, so the framework defaults apply)
    // resolve to 401 or 403 — either is a correctly denied request; a 200
    // would mean the page rendered for a signed-out visitor.
    expect([401, 403]).toContain(response?.status());
  });
});
