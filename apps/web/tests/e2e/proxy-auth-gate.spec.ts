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
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const publicSignupClosed = process.env.FEATURE_PUBLIC_SIGNUP_CLOSED === 'true';

test.describe('proxy auth gate (anonymous)', () => {
  test('GET /onboarding first-hop redirects to /start and keeps resume', async ({
    request,
  }) => {
    // Proxy contract only: /onboarding → /start before the /start page gate.
    const response = await request.get('/onboarding?resume=spotify', {
      maxRedirects: 0,
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers().location ?? '';
    const target = new URL(location, 'http://localhost');
    expect(target.pathname).toBe('/start');
    expect(target.searchParams.get('resume')).toBe('spotify');
  });

  test('GET /onboarding followed nav lands on the public front door', async ({
    page,
  }) => {
    await page.goto('/onboarding?resume=spotify', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    // FEATURE_PUBLIC_SIGNUP_CLOSED (JOV-7973): anonymous /start hands off to
    // /waitlist. Mirror canary-auth-signup-onboarding.spec.ts.
    if (publicSignupClosed) {
      await expect(page).toHaveURL(/\/waitlist(?:\?|$)/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await expect(page.getByTestId('waitlist-role-form')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
    } else {
      await expect(page).toHaveURL(/\/start(?:\?|$)/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      const url = new URL(page.url());
      expect(url.pathname).toBe('/start');
      expect(url.searchParams.get('resume')).toBe('spotify');
      await expect(page).not.toHaveURL(/\/waitlist/);
    }

    await expect(page).not.toHaveURL(/\/app(?:\/|$)/);
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body.trim()).not.toMatch(/^\{["\s]/);
  });

  test('GET /app sends anonymous users to sign-in (followed navigation)', async ({
    page,
  }) => {
    await page.goto('/app', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    await expect(page).toHaveURL(/\/signin(?:\?|$)/i, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
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
