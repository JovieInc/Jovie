/**
 * High-signal proxy fail-closed E2E (action → first middleware response).
 *
 * Anonymous GET /onboarding/checkout must redirect to /signin with
 * redirect_url preserved — mirrors proxy-behavioral unit gold standard but
 * against the real Next middleware stack. No DB, Redis, or test-auth bypass.
 *
 * Filename includes `proxy` so risk-register inventory counts toward
 * target_e2e: 2.
 */
import { expect, test } from '@playwright/test';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('proxy protected-path fail-closed (anonymous)', () => {
  test('GET /onboarding/checkout redirects to /signin with redirect_url', async ({
    request,
  }) => {
    const response = await request.get('/onboarding/checkout', {
      maxRedirects: 0,
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);

    const location = response.headers().location ?? '';
    expect(location).toBeTruthy();
    const target = new URL(location, 'http://localhost');
    expect(target.pathname).toBe('/signin');
    expect(target.searchParams.get('redirect_url')).toBe(
      '/onboarding/checkout'
    );
  });

  test('GET /app redirects to /signin with redirect_url=/app', async ({
    request,
  }) => {
    const response = await request.get('/app', {
      maxRedirects: 0,
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);

    const location = response.headers().location ?? '';
    const target = new URL(location, 'http://localhost');
    expect(target.pathname).toBe('/signin');
    expect(target.searchParams.get('redirect_url')).toBe('/app');
  });
});
