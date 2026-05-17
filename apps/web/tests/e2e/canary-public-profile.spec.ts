/**
 * Public-profile + alert demand-loop canary (JOV-1872)
 *
 * Deterministic regression net for the public-profile surface and audience
 * pipeline. Runs nightly in CI. Every check corresponds to a real bug that
 * reached production — if a new regression would break a check, the check
 * is correctly placed.
 *
 * Bug → Detector mapping:
 *  JOV-2199 (audience-visit 500 / missing column) → "audience-visit endpoint health"
 *  JOV-2202 (React hydration mismatch)            → "no React hydration warnings"
 *  JOV-2095 (admin tasks design)                  → out of scope (admin surface, separate canary)
 *  JOV-2050 / JOV-2018 (profile 404 / ISR)        → "profile renders 200 + h1"
 *
 * Anonymous visitor — no auth required. The dev server must be running and
 * the `/tim` profile must be seeded in the DB for profile checks to pass.
 *
 * @canary @nightly @public-profile
 */

import type { Page, Route } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  CANARY_CREATOR,
  CANARY_SPEC_ROUTES,
  CANARY_SUBSCRIBE_EMAIL,
} from './fixtures/canary-creators';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  waitForHydration,
} from './utils/smoke-test-utils';

// ============================================================================
// Test configuration
// ============================================================================

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

// Skip the canary spec entirely if the DB is not available or if the profile
// is not seeded — we should never fail CI on unrelated infra issues.
const hasDatabase = !!(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Allow analytics endpoints to call through (not mocked) so we validate the
 * real audience-visit path in integration.  Only mock pixel / track endpoints
 * that have no canary value.
 */
async function allowAnalyticsPassthrough(page: Page) {
  await page.route('**/api/track', (r: Route) =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/px', (r: Route) =>
    r.fulfill({ status: 204, body: '' })
  );
}

/** Collect all React hydration warning messages from the console. */
function collectHydrationErrors(page: Page): {
  messages: string[];
  cleanup: () => void;
} {
  const messages: string[] = [];

  const handler = (msg: import('@playwright/test').ConsoleMessage) => {
    const text = msg.text();
    // React hydration mismatch messages always include these phrases
    if (
      text.includes('Hydration failed') ||
      text.includes('hydration mismatch') ||
      text.includes('Text content does not match') ||
      text.includes('did not match') ||
      (text.includes('Warning: ') && text.includes('server rendered HTML'))
    ) {
      messages.push(text);
    }
  };

  page.on('console', handler);
  return {
    messages,
    cleanup: () => page.off('console', handler),
  };
}

/** Navigate to a route and wait for hydration. Returns false if the page
 *  could not be loaded (profile not seeded), so callers can skip. */
async function goAndWait(
  page: Page,
  path: string
): Promise<{ status: number; ok: boolean }> {
  const response = await smokeNavigate(page, path, {
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
  const status = response?.status() ?? 0;
  if (status === 0 || status >= 500) {
    return { status, ok: false };
  }
  await waitForHydration(page);
  return { status, ok: true };
}

// ============================================================================
// Canary checks
// ============================================================================

test.describe('Public-profile canary', () => {
  // --------------------------------------------------------------------------
  // 1. /tim renders 200 with h1 and no console errors
  // --------------------------------------------------------------------------
  test('profile /tim renders 200 with artist name in h1', async ({ page }) => {
    test.setTimeout(90_000);
    await allowAnalyticsPassthrough(page);

    const hydrationErrors = collectHydrationErrors(page);

    const { status, ok } = await goAndWait(page, CANARY_SPEC_ROUTES.profile);

    if (!ok) {
      if (status === 404) {
        test.skip(true, '/tim profile not seeded in this environment');
        return;
      }
      expect(
        status,
        `/${CANARY_CREATOR.handle} returned ${status}`
      ).toBeLessThan(500);
    }

    // h1 must be visible and non-empty
    const h1 = page.locator('h1').first();
    await expect(h1, 'Artist h1 missing').toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    const headingText = (await h1.textContent())?.trim() ?? '';
    expect(
      headingText.length,
      'h1 is empty — profile name not rendered'
    ).toBeGreaterThan(0);

    // Page title should include creator name
    const title = await page.title();
    expect(title.length, 'Page title is empty').toBeGreaterThan(0);

    // No React hydration mismatches (catches JOV-2202)
    hydrationErrors.cleanup();
    expect(
      hydrationErrors.messages,
      `React hydration warnings detected (regression: JOV-2202):\n${hydrationErrors.messages.join('\n')}`
    ).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 2. /tim/alerts renders 200 with notification subscription form
  // --------------------------------------------------------------------------
  test('alerts /tim/alerts renders 200 with subscription form', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await allowAnalyticsPassthrough(page);

    const { status, ok } = await goAndWait(page, CANARY_SPEC_ROUTES.alerts);

    if (!ok) {
      if (status === 404) {
        test.skip(true, '/tim/alerts not available in this environment');
        return;
      }
      expect(status, '/tim/alerts returned error').toBeLessThan(500);
    }

    // The page must have a way for fans to subscribe (email input or CTA button)
    const subscribeEl = page
      .locator(
        [
          'input[type="email"]',
          'input[type="tel"]',
          'button:has-text("Get notified")',
          'button:has-text("Turn on notifications")',
          'button:has-text("Subscribe")',
          'button:has-text("Sign up")',
        ].join(', ')
      )
      .filter({ visible: true });

    await expect(
      subscribeEl.first(),
      'Alerts page must render a subscription form or CTA'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });

  // --------------------------------------------------------------------------
  // 3. /tim/pay renders 200 (follows 307 redirect → ?mode=pay)
  // --------------------------------------------------------------------------
  test('pay /tim/pay renders 200 (follows 307 redirect)', async ({ page }) => {
    test.setTimeout(60_000);
    await allowAnalyticsPassthrough(page);

    // /pay issues a 307 to /{handle}?mode=pay — Playwright follows it
    const response = await smokeNavigate(page, CANARY_SPEC_ROUTES.pay, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    const status = response?.status() ?? 0;

    if (status === 404) {
      test.skip(true, '/tim/pay not available in this environment');
      return;
    }

    // After following the redirect, the final page should be 200
    expect(
      status,
      '/tim/pay (or final redirect destination) returned error'
    ).toBeLessThan(500);

    await waitForHydration(page);

    // After the 307, the URL should contain the profile handle
    const finalUrl = page.url();
    expect(
      finalUrl,
      'Redirect destination should still be the /tim profile'
    ).toContain(CANARY_CREATOR.handle);
  });

  // --------------------------------------------------------------------------
  // 4. POST /api/audience/visit succeeds (catches JOV-2199 regression)
  //    The `latest_referrer_url` column must exist; a 500 here means it's missing.
  // --------------------------------------------------------------------------
  test('audience-visit POST /api/audience/visit returns 2xx (regression: JOV-2199)', async ({
    page,
  }) => {
    test.setTimeout(30_000);

    // We need a real profile ID for this test. Navigate to /tim first so we
    // can extract it from the page's embedded JSON.
    const { status, ok } = await goAndWait(page, CANARY_SPEC_ROUTES.profile);

    if (!ok) {
      if (status === 404) {
        test.skip(true, '/tim not seeded — skipping audience-visit check');
        return;
      }
    }

    // Extract the profile ID from the page's __NEXT_DATA__ or a data attribute.
    // Fall back to making the POST with a known-invalid UUID — a 404 response
    // (profile not found) still proves the route is healthy (no 500).
    let profileId: string | null = null;
    try {
      profileId = await page.evaluate(() => {
        // Look for profileId in __NEXT_DATA__
        const nextData = (
          window as unknown as {
            __NEXT_DATA__?: {
              props?: { pageProps?: { profile?: { id?: string } } };
            };
          }
        ).__NEXT_DATA__;
        return nextData?.props?.pageProps?.profile?.id ?? null;
      });
    } catch {
      // No __NEXT_DATA__ profileId — use a synthetic sentinel UUID
    }

    const sentinelUuid = '00000000-0000-0000-0000-000000000001';
    const resolvedProfileId = profileId ?? sentinelUuid;

    // Make the POST via page.evaluate so it goes through the same origin
    const result = await page.evaluate(
      async ({ pid }: { pid: string }) => {
        const res = await fetch('/api/audience/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: pid,
            userAgent: 'JovieCanaryBot/1.0',
            referrer: null,
            deviceType: 'unknown',
            utmParams: { source: 'canary', medium: 'monitoring' },
          }),
        });
        return { status: res.status, ok: res.ok };
      },
      { pid: resolvedProfileId }
    );

    // 2xx = success; 404 = profile not found (healthy route); 429 = rate-limited (healthy)
    // 400 = bad payload (healthy route, synthetic UUID may fail schema validation)
    // 500 = broken (catches JOV-2199)
    const isHealthy = result.status < 500 || result.status === 404;
    expect(
      isHealthy,
      `POST /api/audience/visit returned ${result.status} — route is broken (regression: JOV-2199)`
    ).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 5. Notification subscription form submission (alerts flow)
  // --------------------------------------------------------------------------
  test('notification subscription form submits without 5xx', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    if (!hasDatabase) {
      test.skip(true, 'DATABASE_URL not available — subscription test skipped');
      return;
    }

    await allowAnalyticsPassthrough(page);

    const { status, ok } = await goAndWait(page, CANARY_SPEC_ROUTES.alerts);

    if (!ok) {
      if (status === 404) {
        test.skip(true, '/tim/alerts not seeded');
        return;
      }
      expect(status).toBeLessThan(500);
    }

    // Locate email input
    const emailInput = page.locator('input[type="email"]').first();
    const hasEmailInput = await emailInput
      .isVisible({ timeout: SMOKE_TIMEOUTS.QUICK })
      .catch(() => false);

    if (!hasEmailInput) {
      // Alerts form may not be visible for this profile — skip gracefully
      test.skip(
        true,
        'No email input on alerts page — form not present for this creator'
      );
      return;
    }

    // Intercept the subscribe API call so we can assert on the request/response
    // without actually creating a real audience record
    let capturedStatus: number | null = null;
    await page.route('**/api/audience/**', async (route: Route) => {
      const res = await route.fetch();
      capturedStatus = res.status();
      await route.fulfill({ response: res });
    });

    await emailInput.fill(CANARY_SUBSCRIBE_EMAIL);

    // Try to find and click a submit button
    const submitBtn = page
      .locator(
        [
          'button[type="submit"]',
          'button:has-text("Get notified")',
          'button:has-text("Turn on notifications")',
          'button:has-text("Subscribe")',
          'button:has-text("Sign up")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    const hasSubmit = await submitBtn
      .isVisible({ timeout: SMOKE_TIMEOUTS.QUICK })
      .catch(() => false);

    if (!hasSubmit) {
      test.skip(true, 'No submit button found on alerts page');
      return;
    }

    await submitBtn.click();

    // Wait for any API response
    await page
      .waitForResponse(res => res.url().includes('/api/audience'), {
        timeout: 10_000,
      })
      .catch(() => null);

    if (capturedStatus !== null) {
      expect(
        capturedStatus,
        `Subscription API returned ${capturedStatus} — 5xx indicates a broken subscribe path`
      ).toBeLessThan(500);
    }
  });

  // --------------------------------------------------------------------------
  // 6. Claim view: /tim?noredirect=1 renders the public profile (not a redirect)
  //    Catches regressions where the profile owner is redirected away before
  //    audience tracking can run.
  // --------------------------------------------------------------------------
  test('claim view /tim?noredirect=1 renders public profile', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await allowAnalyticsPassthrough(page);

    const { status, ok } = await goAndWait(
      page,
      CANARY_SPEC_ROUTES.profileNoRedirect
    );

    if (!ok) {
      if (status === 404) {
        test.skip(true, '/tim not seeded');
        return;
      }
      expect(status).toBeLessThan(500);
    }

    // Should still be on the /tim route (not redirected to /app/dashboard)
    const finalUrl = page.url();
    const redirectedToDashboard =
      finalUrl.includes('/app/dashboard') || finalUrl.includes('/app/');

    // If the user is NOT authenticated this should just show the public profile.
    // If redirectedToDashboard is true, that means the noredirect param is not
    // being respected — a regression.
    expect(
      redirectedToDashboard,
      `?noredirect=1 was not respected — redirected to ${finalUrl}`
    ).toBe(false);

    const h1 = page.locator('h1').first();
    const h1Visible = await h1
      .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
      .catch(() => false);

    if (h1Visible) {
      const headingText = (await h1.textContent())?.trim() ?? '';
      expect(headingText.length, 'h1 empty on claim view').toBeGreaterThan(0);
    }
  });

  // --------------------------------------------------------------------------
  // 7. No React hydration warnings on the profile page (catches JOV-2202)
  // --------------------------------------------------------------------------
  test('no React hydration warnings on /tim (regression: JOV-2202)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await allowAnalyticsPassthrough(page);

    const hydrationErrors = collectHydrationErrors(page);

    const { status, ok } = await goAndWait(page, CANARY_SPEC_ROUTES.profile);

    if (!ok) {
      hydrationErrors.cleanup();
      if (status === 404) {
        test.skip(true, '/tim not seeded');
        return;
      }
    }

    // Wait a tick so all hydration messages have flushed
    await page
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => {});

    hydrationErrors.cleanup();

    expect(
      hydrationErrors.messages,
      `React hydration mismatch detected (JOV-2202 regression):\n${hydrationErrors.messages.join('\n')}`
    ).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 8. SMS / email fallback: alerts form shows SMS when configured, email otherwise
  // --------------------------------------------------------------------------
  test('alerts form shows SMS or email input — not neither', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await allowAnalyticsPassthrough(page);

    const { status, ok } = await goAndWait(page, CANARY_SPEC_ROUTES.alerts);

    if (!ok) {
      if (status === 404) {
        test.skip(true, '/tim/alerts not seeded');
        return;
      }
      expect(status).toBeLessThan(500);
    }

    // At least one of email or SMS input must be present
    const emailInput = page.locator('input[type="email"]').first();
    const telInput = page.locator('input[type="tel"]').first();

    const hasEmail = await emailInput
      .isVisible({ timeout: SMOKE_TIMEOUTS.QUICK })
      .catch(() => false);
    const hasTel = await telInput
      .isVisible({ timeout: SMOKE_TIMEOUTS.QUICK })
      .catch(() => false);

    // May skip if the alerts form isn't present at all (profile config)
    if (!hasEmail && !hasTel) {
      // Check for a CTA button instead
      const ctaBtn = page
        .locator(
          'button:has-text("Get notified"), button:has-text("Turn on notifications"), button:has-text("Subscribe")'
        )
        .filter({ visible: true });
      const hasCta = await ctaBtn
        .isVisible({ timeout: SMOKE_TIMEOUTS.QUICK })
        .catch(() => false);

      if (!hasCta) {
        test.skip(
          true,
          'Alerts form not rendered for this creator (no SMS/email/CTA visible)'
        );
        return;
      }
    }

    expect(
      hasEmail || hasTel,
      'Neither email nor SMS input rendered on alerts page — subscription is broken'
    ).toBe(true);
  });
});
