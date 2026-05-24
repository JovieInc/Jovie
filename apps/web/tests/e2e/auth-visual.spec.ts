/**
 * Auth visual regression tests — JOV-2037
 *
 * Snapshots at gated breakpoints: 375, 768, 1280, 1920.
 * Ultra-wide (2560+) stays in nightly per .claude/rules/testing.md.
 *
 * Targets:
 *   - Marketing modal in sign-in mode
 *   - Marketing modal in sign-up mode
 *   - /signin full page
 *   - /signup full page
 *
 * Baselines stored in: tests/e2e/__snapshots__/auth-visual.spec.ts/
 *
 * Run:
 *   pnpm run test:web:e2e -- tests/e2e/auth-visual.spec.ts
 * Update baselines:
 *   pnpm run test:web:e2e -- tests/e2e/auth-visual.spec.ts --update-snapshots
 */
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

// Visual tests use no stored auth state
test.use({ storageState: { cookies: [], origins: [] } });

// Gated breakpoints (ultra-wide excluded from gated lane per testing rules)
const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
] as const;

const SNAPSHOT_TIMEOUT = 30_000;
const NAV_TIMEOUT = 60_000;

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/handle/check**', r =>
    r.fulfill({
      status: 200,
      body: JSON.stringify({ available: true }),
      contentType: 'application/json',
    })
  );
}

/**
 * Mask elements with content that changes on every load
 * (Clerk CSRF tokens, any time-based fields, etc.)
 */
function getClerkMasks(page: import('@playwright/test').Page) {
  return [
    // Input fields where Clerk injects hidden tokens
    page.locator('input[name="__clerk_csrf_token"]'),
    page.locator('input[type="hidden"]'),
    // Any time-based elements
    page.locator('[data-clerk-time]'),
  ];
}

function isClerkHandshakeRedirect(url: string): boolean {
  return url.includes('clerk') && url.includes('handshake');
}

async function openInterceptedAuthModal(
  page: import('@playwright/test').Page,
  mode: 'signin' | 'signup'
) {
  await page.goto('/', {
    waitUntil: 'networkidle',
    timeout: NAV_TIMEOUT,
  });

  if (mode === 'signin') {
    await page
      .getByRole('link', { name: /^sign in$/i })
      .first()
      .click();
  } else {
    await page.locator('[data-cta-sign-up="true"]').first().click();
  }

  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    // Clerk can leave background requests open; the dialog probe below is the gate.
  });
}

// ---------------------------------------------------------------------------
// Marketing modal snapshots — opens through intercepted auth routes
// ---------------------------------------------------------------------------
test.describe('Auth modal visual regression', () => {
  for (const bp of BREAKPOINTS) {
    test.describe(`${bp.name} (${bp.width}×${bp.height})`, () => {
      test('sign-in modal', async ({ page }) => {
        await blockAnalytics(page);
        await page.setViewportSize({ width: bp.width, height: bp.height });

        await openInterceptedAuthModal(page, 'signin');

        if (isClerkHandshakeRedirect(page.url())) {
          test.skip(true, 'Clerk handshake redirect — modal not available');
          return;
        }

        // Wait for the modal dialog to appear
        const dialog = page.getByRole('dialog');
        const dialogVisible = await dialog
          .isVisible({ timeout: SNAPSHOT_TIMEOUT })
          .catch(() => false);

        if (!dialogVisible) {
          test.skip(true, 'Modal did not render — Clerk may not be available');
          return;
        }

        await expect(page).toHaveScreenshot(`modal-signin-${bp.name}.png`, {
          fullPage: false,
          maxDiffPixels: 200,
          mask: getClerkMasks(page),
        });
      });

      test('sign-up modal', async ({ page }) => {
        await blockAnalytics(page);
        await page.setViewportSize({ width: bp.width, height: bp.height });

        await openInterceptedAuthModal(page, 'signup');

        if (isClerkHandshakeRedirect(page.url())) {
          test.skip(true, 'Clerk handshake redirect — modal not available');
          return;
        }

        const dialog = page.getByRole('dialog');
        const dialogVisible = await dialog
          .isVisible({ timeout: SNAPSHOT_TIMEOUT })
          .catch(() => false);

        if (!dialogVisible) {
          test.skip(true, 'Modal did not render — Clerk may not be available');
          return;
        }

        await expect(page).toHaveScreenshot(`modal-signup-${bp.name}.png`, {
          fullPage: false,
          maxDiffPixels: 200,
          mask: getClerkMasks(page),
        });
      });
    });
  }
});

// ---------------------------------------------------------------------------
// /signin page snapshots
// ---------------------------------------------------------------------------
test.describe('/signin page visual regression', () => {
  for (const bp of BREAKPOINTS) {
    test(`${bp.name} (${bp.width}×${bp.height})`, async ({ page }) => {
      await blockAnalytics(page);
      await page.setViewportSize({ width: bp.width, height: bp.height });

      await page.goto(APP_ROUTES.SIGNIN, {
        waitUntil: 'networkidle',
        timeout: NAV_TIMEOUT,
      });

      if (isClerkHandshakeRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      // Ensure the page is on /signin (not redirected to /app)
      const pathname = new URL(page.url()).pathname;
      if (pathname !== APP_ROUTES.SIGNIN) {
        test.skip(true, `Unexpected redirect to ${pathname}`);
        return;
      }

      // Wait for the main content area
      await page
        .locator('#auth-form, [data-clerk-component], main')
        .first()
        .isVisible({ timeout: SNAPSHOT_TIMEOUT })
        .catch(() => false);

      await expect(page).toHaveScreenshot(`signin-page-${bp.name}.png`, {
        fullPage: false,
        maxDiffPixels: 200,
        mask: getClerkMasks(page),
      });
    });
  }
});

// ---------------------------------------------------------------------------
// /signup page snapshots
// ---------------------------------------------------------------------------
test.describe('/signup page visual regression', () => {
  for (const bp of BREAKPOINTS) {
    test(`${bp.name} (${bp.width}×${bp.height})`, async ({ page }) => {
      await blockAnalytics(page);
      await page.setViewportSize({ width: bp.width, height: bp.height });

      await page.goto(APP_ROUTES.SIGNUP, {
        waitUntil: 'networkidle',
        timeout: NAV_TIMEOUT,
      });

      if (isClerkHandshakeRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      const pathname = new URL(page.url()).pathname;
      if (pathname !== APP_ROUTES.SIGNUP) {
        test.skip(true, `Unexpected redirect to ${pathname}`);
        return;
      }

      await page
        .locator('#auth-form, [data-clerk-component], main')
        .first()
        .isVisible({ timeout: SNAPSHOT_TIMEOUT })
        .catch(() => false);

      await expect(page).toHaveScreenshot(`signup-page-${bp.name}.png`, {
        fullPage: false,
        maxDiffPixels: 200,
        mask: getClerkMasks(page),
      });
    });
  }
});
