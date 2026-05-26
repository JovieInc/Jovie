import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { primeVercelBypassCookie } from '../helpers/vercel-preview';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_UNAVAILABLE_PATTERN =
  /auth unavailable|authentication unavailable|temporarily unavailable|clerk is not configured/i;

test.beforeEach(() => {
  test.skip(
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
      process.env.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1',
    'Public auth readiness requires a real Clerk runtime'
  );
});

function expectPublicAuthReady(pathname: string) {
  return async ({ page }: { page: Page }) => {
    await primeVercelBypassCookie(page, process.env.BASE_URL, pathname);

    await page.goto(pathname, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => {
        // Clerk can keep background requests open. The DOM readiness assertion is
        // the user-facing gate.
      });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(AUTH_UNAVAILABLE_PATTERN);

    const shell = page.locator('[data-auth-shell-mode]').first();
    await expect(shell).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    await expect(shell).toHaveAttribute('data-auth-shell-ready', 'true', {
      timeout: 30_000,
    });
    await expect(page.locator('[data-auth-stable-placeholder]')).toHaveCount(0);

    const clerkSurface = page.locator('[data-auth-clerk-surface]').first();
    await expect(clerkSurface).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(clerkSurface).not.toHaveAttribute('aria-hidden', 'true');

    const surfaceState = await clerkSurface.evaluate(element => {
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
        '[data-auth-clerk-surface] button:not([disabled])',
        '[data-auth-clerk-surface] input:not([disabled])',
      ].join(', ')
    );
    await expect(liveAuthControls.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  };
}

test.describe('public auth readiness @production-smoke', () => {
  test(
    'signin replaces the disabled placeholder with live Clerk controls',
    expectPublicAuthReady(APP_ROUTES.SIGNIN)
  );

  test(
    'signup replaces the disabled placeholder with live Clerk controls',
    expectPublicAuthReady(APP_ROUTES.SIGNUP)
  );
});
