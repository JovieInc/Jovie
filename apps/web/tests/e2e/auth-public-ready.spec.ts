import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  assertExactNavigationUrl,
  primeVercelBypassCookie,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_UNAVAILABLE_PATTERN =
  /auth unavailable|authentication unavailable|temporarily unavailable|clerk is not configured/i;

test.beforeEach(() => {
  test.skip(
    process.env.NEXT_PUBLIC_AUTH_MOCK === '1' ||
      process.env.NEXT_PUBLIC_AUTH_PROXY_DISABLED === '1',
    'Public auth readiness requires a real Clerk runtime'
  );
});

function expectPublicAuthReady(pathname: string) {
  return async ({ page }: { page: Page }) => {
    const expectedOrigin = requireExactNavigationOrigin(process.env.BASE_URL);
    await primeVercelBypassCookie(page, process.env.BASE_URL, pathname);

    await page.goto(pathname, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      `Public auth navigation for ${pathname}`
    );
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => {
        // Clerk can keep background requests open. The DOM readiness assertion is
        // the user-facing gate.
      });
    assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      `Settled public auth navigation for ${pathname}`
    );

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(AUTH_UNAVAILABLE_PATTERN);

    const shell = page.locator('[data-auth-shell-mode]').first();
    await expect(shell).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    await expect(shell).toHaveAttribute('data-auth-shell-ready', 'true', {
      timeout: 30_000,
    });
    await expect(page.locator('[data-auth-stable-placeholder]')).toHaveCount(0);

    const ssoSurface = page.locator('[data-auth-sso-surface]').first();
    await expect(ssoSurface).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(ssoSurface).not.toHaveAttribute('aria-hidden', 'true');

    const surfaceState = await ssoSurface.evaluate(element => {
      const style = window.getComputedStyle(element);
      return {
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
      };
    });
    expect(surfaceState).toEqual(
      expect.objectContaining({
        opacity: '1',
        pointerEvents: 'auto',
      })
    );

    const liveAuthControls = page.locator(
      [
        '[data-auth-sso-surface] button[data-auth-provider-slot]:not([disabled])',
        '[data-auth-sso-surface] input:not([disabled])',
      ].join(', ')
    );
    await expect(liveAuthControls.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      `Verified public auth navigation for ${pathname}`
    );
  };
}

test.describe('public auth readiness @production-smoke', () => {
  test(
    'signin replaces the disabled placeholder with owned SSO controls',
    expectPublicAuthReady(APP_ROUTES.SIGNIN)
  );

  // Closed/invite entry (canon/PRODUCT.md, 2026-11-02, JOV-7973): anonymous
  // /signup canonically redirects to the /waitlist role form instead of
  // rendering the auth shell, so the smoke asserts the canonical handoff —
  // the settled URL is /waitlist and its form renders live interactive
  // controls. When public signup reopens (FEATURE_PUBLIC_SIGNUP_CLOSED=false),
  // restore the auth-shell smoke for /signup here.
  test('signup lands on the live waitlist role form while public signup is closed', async ({
    page,
  }) => {
    const expectedOrigin = requireExactNavigationOrigin(process.env.BASE_URL);
    await primeVercelBypassCookie(
      page,
      process.env.BASE_URL,
      APP_ROUTES.SIGNUP
    );

    await page.goto(APP_ROUTES.SIGNUP, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => {
        // Clerk can keep background requests open. The settled-URL and
        // form assertions are the user-facing gate.
      });

    const settled = assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      'Closed-signup navigation for /signup'
    );
    expect(settled.pathname).toBe('/waitlist');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(AUTH_UNAVAILABLE_PATTERN);

    const form = page.locator('[data-testid="waitlist-role-form"]');
    await expect(form).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    const liveControls = form.locator(
      'input:not([disabled]), button:not([disabled])'
    );
    await expect(liveControls.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
