import { expect, type Page, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Synthetic Monitoring — Critical page health + performance baseline.
 *
 * The legacy email/OTP signup canary that previously lived in this file
 * has moved to `synthetic-legacy-otp.spec.ts` (gated behind
 * `E2E_PROD_LEGACY_CANARY` at the workflow level) and is being replaced
 * by the Layer A UI smoke in `synthetic-auth-ui.spec.ts` (JOV-2446).
 *
 * This file keeps the always-on critical-page health checks and
 * performance baseline. Neither depends on signup/auth.
 */

// Override global storageState to run these tests as unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } });

const HOMEPAGE_PRIMARY_CTA_TEST_ID = 'homepage-primary-cta';
const SIGNUP_PATH = '/signup';
const START_PATH = '/start';
const WAITLIST_PATH = '/waitlist';

function isClosedSignupRedirect(page: Page, requestedPath: string) {
  return (
    [START_PATH, SIGNUP_PATH].includes(requestedPath) &&
    new URL(page.url()).pathname === WAITLIST_PATH
  );
}

// Public signup is open (Tim, 2026-11-09): /signup and anonymous /start must
// render their own surfaces, never bounce to /waitlist. The closed handoff is
// asserted only when the FEATURE_PUBLIC_SIGNUP_CLOSED kill switch is set.
const SIGNUP_CLOSED_KILL_SWITCH =
  process.env.FEATURE_PUBLIC_SIGNUP_CLOSED === 'true';

async function assertClosedSignupWaitlist(page: Page) {
  await expect(
    page.getByTestId('waitlist-role-form'),
    'Closed signup must land on a visible waitlist form'
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-auth-shell-mode="sign-up"]'),
    'Closed signup must not render a sign-up auth shell'
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /couldn.t start your chat|cannot complete the security check|taking longer than expected/i
    )
  ).toHaveCount(0);
}
const TURNSTILE_CONFIG_ERROR = 'turnstile is not configured';
const TURNSTILE_DOMAIN_ERROR = 'verification failed (110200)';

test.describe('Synthetic Monitoring - Golden Path', () => {
  // Only run in synthetic monitoring mode
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip();
    }
  });

  test('Critical page health checks', async ({ page }) => {
    test.setTimeout(60_000);

    // Intercept analytics to prevent test interference
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    const criticalPages = [
      { path: '/', name: 'Homepage' },
      { path: START_PATH, name: 'Start Onboarding Chat' },
      { path: '/dualipa', name: 'Profile Page' },
      { path: '/dualipa?mode=listen', name: 'Listen Mode' },
      { path: '/dualipa?mode=pay', name: 'Pay Mode' },
      { path: SIGNUP_PATH, name: 'Sign Up' },
    ];

    for (const { path, name } of criticalPages) {
      console.log(`[Synthetic] Health check: ${name} (${path})`);

      await page.goto(path, {
        waitUntil: 'commit',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await waitForHydration(page);

      // Basic health checks. Public signup is open (canon/PRODUCT.md,
      // 2026-11-09): anonymous /start and /signup must stay on their own
      // surface. Only when the FEATURE_PUBLIC_SIGNUP_CLOSED kill switch is
      // set do they redirect to /waitlist — accept that only as a working
      // waitlist form.
      if (SIGNUP_CLOSED_KILL_SWITCH && isClosedSignupRedirect(page, path)) {
        await assertClosedSignupWaitlist(page);
      } else {
        await expect(page).toHaveURL(
          new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        );
      }

      // Check for critical errors
      const criticalErrorSelectors = [
        'text="500"',
        'text="Internal Server Error"',
        'text="Something went wrong"',
        `text="${TURNSTILE_CONFIG_ERROR}"`,
        `text="${TURNSTILE_DOMAIN_ERROR}"`,
        '[data-testid="error-boundary"]',
      ];

      for (const selector of criticalErrorSelectors) {
        await expect(page.locator(selector)).not.toBeVisible();
      }

      // Ensure page has loaded content
      await expect(page.locator('body')).not.toBeEmpty();

      console.log(`[Synthetic] ✅ ${name} health check passed`);
    }
  });

  test('Onboarding start page shows no visible Turnstile UI (JOV-3305)', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    await page.goto(START_PATH, {
      waitUntil: 'commit',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);
    if (SIGNUP_CLOSED_KILL_SWITCH && isClosedSignupRedirect(page, START_PATH)) {
      // No chat or Turnstile exists while signup is closed; the waitlist is the surface.
      await assertClosedSignupWaitlist(page);
      return;
    }

    // The Turnstile widget must be fully invisible (appearance: 'execute').
    // No "Security Check" heading, no visible bordered widget frame, no
    // "Required before your first message" copy should appear on the
    // golden-path start page. If Cloudflare's Turnstile re-pings or falls
    // back to interactive mode, this assertion goes red (JOV-3305).
    await expect(
      page.getByText('Security Check'),
      'No visible "Security Check" panel should appear on the start page'
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText('Required before your first message.'),
      'No visible Turnstile interaction prompt should appear on the start page'
    ).not.toBeVisible();
    await expect(
      page.getByTestId('onboarding-turnstile-panel'),
      'Turnstile panel should not be visible on the golden-path start page'
    ).not.toBeVisible();

    // The widget frame should exist but be screen-reader-only (invisible).
    const widgetFrame = page.getByTestId('onboarding-turnstile-widget-frame');
    if ((await widgetFrame.count()) > 0) {
      // If the frame exists, it must be hidden (sr-only or not visible)
      await expect(widgetFrame).not.toBeVisible();
    }

    console.log('[Synthetic] ✅ No visible Turnstile UI on start page');
  });

  test('Performance baseline check', async ({ page }) => {
    test.setTimeout(60_000);

    // Intercept analytics to prevent test interference
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    console.log('[Synthetic] Performance baseline check');

    const startTime = Date.now();

    await page.goto('/', {
      waitUntil: 'commit',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    const loadTime = Date.now() - startTime;

    // Performance thresholds (in milliseconds)
    const LOAD_TIME_THRESHOLD = 10000; // 10 seconds max for homepage

    console.log(`[Synthetic] Homepage load time: ${loadTime}ms`);

    if (loadTime > LOAD_TIME_THRESHOLD) {
      console.warn(
        `[Synthetic] ⚠️ Homepage load time (${loadTime}ms) exceeds threshold (${LOAD_TIME_THRESHOLD}ms)`
      );
      // Don't fail the test, but log for monitoring
    }

    // Check for performance-critical elements
    await expect(page.getByTestId('marketing-section-hero')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId(HOMEPAGE_PRIMARY_CTA_TEST_ID)).toBeVisible({
      timeout: 5000,
    });

    console.log('[Synthetic] ✅ Performance check completed');
  });
});
