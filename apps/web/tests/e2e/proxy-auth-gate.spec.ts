/**
 * High-signal proxy auth-gate E2E (action → resulting state).
 *
 * Anthropic / poteto verification style: drive the real edge the way a user
 * would, assert the outcome URL + headers/content contract — not screenshots.
 * Covers proxy.ts unauthenticated app-shell and onboarding redirects that
 * unit middleware tests already pin, proven here end-to-end.
 *
 * Filename includes `proxy` so the risk-register surface inventory can count it.
 */
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const NAV_TIMEOUT = 30_000;

test.describe('proxy auth gate (anonymous)', () => {
  test('GET /onboarding redirects to /start and keeps resume', async ({
    page,
  }) => {
    await page.goto('/onboarding?resume=spotify', {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });

    await expect(page).toHaveURL(/\/start(?:\?|$)/, { timeout: NAV_TIMEOUT });
    const url = new URL(page.url());
    expect(url.pathname).toBe('/start');
    expect(url.searchParams.get('resume')).toBe('spotify');

    // Resulting state: public front door, not the authenticated app shell.
    await expect(page).not.toHaveURL(/\/app(?:\/|$)/);
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body.trim()).not.toMatch(/^\{["\s]/);
    await expect(page.locator('h1, h2, [data-testid]').first()).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
  });

  test('GET /app sends anonymous users to sign-in (followed navigation)', async ({
    page,
  }) => {
    await page.goto('/app', {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });

    await expect(page).toHaveURL(/\/signin(?:\?|$)/i, {
      timeout: NAV_TIMEOUT,
    });
    await expect(page).not.toHaveURL(/\/app(?:\/|$)/);
    // First-hop Location + redirect_url are asserted in
    // proxy-protected-path-fail-closed.spec.ts (maxRedirects: 0).
  });

  test('retired /investors stays a neutral noindex 404 via proxy', async ({
    request,
  }) => {
    const response = await request.get('/investors', { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers()['x-robots-tag'] ?? '').toMatch(/noindex/iu);
    expect(response.headers()['cache-control'] ?? '').toMatch(/no-store/iu);
    expect(await response.text()).not.toMatch(/investor brief/iu);
  });
});
