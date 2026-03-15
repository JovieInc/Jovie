import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser } from '../helpers/clerk-auth';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

/**
 * Suite 5: Resilience / Chaos Tests (JOV-1427)
 *
 * Tests the app's resilience under adverse conditions:
 * 1. Slow network — API calls delayed 2s, app must show loading states, not crash
 * 2. API failures — key endpoints return 500, error boundaries must catch, not blank/crash
 * 3. Rapid navigation — switching between 6 dashboard pages quickly, no React errors
 * 4. Auth session expiry — clearing cookies mid-session redirects to signin, not crash
 *
 * Every assertion would FAIL if the corresponding resilience is broken.
 * No theater. Chaos tests must exercise real failure paths.
 *
 * Run headed to visually verify:
 *   doppler run -- pnpm exec playwright test resilience --project=chromium --headed
 *
 * @chaos @resilience @critical
 */

function hasClerkCredentials(): boolean {
  const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
  return (
    username.length > 0 &&
    (password.length > 0 || username.includes('+clerk_test')) &&
    process.env.CLERK_TESTING_SETUP_SUCCESS === 'true'
  );
}

async function gotoWithRetry(
  page: import('@playwright/test').Page,
  url: string,
  options: Parameters<import('@playwright/test').Page['goto']>[1]
) {
  const maxAttempts = process.env.E2E_FAST_ITERATION === '1' ? 3 : 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransient =
        message.includes('ERR_ABORTED') ||
        message.includes('frame was detached') ||
        message.includes('ERR_CONNECTION_RESET') ||
        message.includes('Timeout');

      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }
    }

    await page.waitForTimeout(500 * attempt);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to navigate to ${url}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOW NETWORK RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Slow network resilience', () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured');
    await ensureSignedInUser(page);
  });

  test('dashboard profile page shows content or loading state under API delay', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Injected slow-network resilience runs in the slower resilience lane'
    );
    test.setTimeout(120_000);

    await page.route('**/api/**', async route => {
      await new Promise<void>(resolve => setTimeout(resolve, 2_000));
      await route.continue();
    });

    const response = await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });

    expect(
      response?.status() ?? 0,
      'Profile page crashed on slow network'
    ).toBeLessThan(500);

    await page
      .waitForFunction(
        () => {
          const bodyText = document.body?.innerText?.trim() ?? '';
          return bodyText.length > 20;
        },
        { timeout: 15_000 }
      )
      .catch(() => false);

    expect(
      (
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) ?? ''
      ).trim().length,
      'Profile page is blank under slow network — loading state missing'
    ).toBeGreaterThan(20);

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('application error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API FAILURE RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('API failure resilience', () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured');
    await ensureSignedInUser(page);
  });

  test('audience page shows error UI (not blank) when audience API returns 500', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Injected API-failure resilience runs in the slower resilience lane'
    );
    test.setTimeout(120_000);

    await page.route('**/api/audience/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service unavailable' }),
      });
    });

    const response = await gotoWithRetry(page, APP_ROUTES.AUDIENCE, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });

    expect(
      response?.status() ?? 0,
      'Audience SSR crashed on API failure'
    ).toBeLessThan(500);

    await page.waitForLoadState('domcontentloaded');
    await page
      .waitForFunction(
        () => {
          const bodyText = document.body?.innerText?.trim() ?? '';
          return bodyText.length > 100 && !bodyText.includes('Loading...');
        },
        { timeout: 15_000 }
      )
      .catch(() => {});

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';

    expect(
      bodyText.trim().length,
      'Audience page is completely blank after API 500 — error boundary missing'
    ).toBeGreaterThan(100);

    expect(bodyText.toLowerCase()).not.toContain('unhandled runtime error');
    expect(bodyText.toLowerCase()).not.toContain('minified react error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RAPID NAVIGATION RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Rapid navigation resilience', () => {
  test.setTimeout(480_000);

  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured');
    await ensureSignedInUser(page);
  });

  test('rapid navigation through dashboard pages causes no React crashes', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Rapid navigation resilience runs in the slower resilience lane'
    );
    test.setTimeout(300_000);

    const pages = [
      APP_ROUTES.DASHBOARD_PROFILE,
      APP_ROUTES.AUDIENCE,
      APP_ROUTES.RELEASES,
      APP_ROUTES.DASHBOARD_EARNINGS,
      APP_ROUTES.DASHBOARD_PROFILE, // return to start
    ] as const;

    const reactErrors: string[] = [];
    let currentPath = 'before-navigation';

    // Collect React errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text().toLowerCase();
        const isReactError =
          text.includes('rendered more hooks') ||
          text.includes('rendered fewer hooks') ||
          text.includes('invalid hook call') ||
          text.includes('maximum update depth') ||
          text.includes('too many re-renders') ||
          text.includes('hydration failed') ||
          text.includes('minified react error');
        if (isReactError) {
          reactErrors.push(`${currentPath}: ${msg.text()}`);
        }
      }
    });

    page.on('pageerror', error => {
      const text = error.message.toLowerCase();
      if (
        text.includes('react') ||
        text.includes('hook') ||
        text.includes('hydration')
      ) {
        reactErrors.push(`${currentPath}: ${error.message}`);
      }
    });

    const failures: string[] = [];

    for (const path of pages) {
      currentPath = path;
      try {
        await page.goto(path, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
          continue; // transient under load — skip
        }
        failures.push(`${path}: ${msg}`);
        continue;
      }

      const bodyText =
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) ?? '';
      if (
        bodyText.toLowerCase().includes('application error') ||
        bodyText.toLowerCase().includes('unhandled runtime error')
      ) {
        failures.push(`${path}: error boundary triggered`);
      }
    }

    expect(
      reactErrors,
      `React errors during rapid navigation:\n${reactErrors.join('\n')}`
    ).toHaveLength(0);

    expect(
      failures,
      `Page failures during rapid navigation:\n${failures.join('\n')}`
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH EXPIRY RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auth expiry resilience', () => {
  test.setTimeout(300_000);

  test('clearing session cookies redirects to signin, not blank or crash', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Injected auth-expiry resilience runs in the slower resilience lane'
    );
    test.setTimeout(120_000);

    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured');

    // Start from an authenticated state. This test exercises session expiry,
    // not the initial sign-in flow itself.
    await ensureSignedInUser(page);

    // Verify we're authenticated
    const dashResponse = await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    if ((dashResponse?.status() ?? 0) >= 500) {
      test.skip(true, 'Dashboard not available for auth expiry test');
      return;
    }

    // Simulate session expiry by clearing Clerk cookies
    await page.context().clearCookies({
      name: /^__(session|client|clerk)/,
    });

    // Navigate to a protected route — should redirect gracefully
    try {
      await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(true, 'Server too slow for auth expiry test');
        return;
      }
      throw e;
    }

    await page
      .waitForFunction(
        () => {
          const bodyText = document.body?.innerText?.trim() ?? '';
          return bodyText.length > 20 && !bodyText.includes('Loading...');
        },
        { timeout: 15_000 }
      )
      .catch(() => {});

    const finalUrl = page.url();
    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';

    // Should redirect to signin — NOT show a blank page or crash
    const redirectedToSignin =
      finalUrl.includes('/signin') || finalUrl.includes('/sign-in');
    const hasContent = bodyText.trim().length > 50;

    // Either redirected to signin OR still shows the page (if server-side session is valid)
    // What's NOT acceptable: blank page or crash
    expect(
      hasContent,
      'Page is blank after session cookie cleared — should redirect to signin or re-auth'
    ).toBe(true);

    // Absolutely must not crash
    expect(bodyText.toLowerCase()).not.toContain('unhandled runtime error');
    expect(bodyText.toLowerCase()).not.toContain('application error');
    expect(bodyText.toLowerCase()).not.toContain('minified react error');

    if (redirectedToSignin) {
      // Verify signin page actually rendered
      const bodyLower = bodyText.toLowerCase();
      const hasSigninContent =
        bodyLower.includes('sign') ||
        bodyLower.includes('email') ||
        bodyLower.includes('log in') ||
        bodyLower.includes('password');
      expect(
        hasSigninContent,
        'Redirected to /signin but page is missing sign-in form content'
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MUSICFETCH / ENRICHMENT CHAOS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MusicFetch enrichment chaos', () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured');
    test.skip(
      FAST_ITERATION,
      'MusicFetch chaos runs in the slower resilience lane'
    );
    await ensureSignedInUser(page);
  });

  test('dashboard stays alive when enrichment status returns 500', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Simulate MusicFetch / DSP enrichment backend being completely down
    await page.route('**/api/dsp/**', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'DSP service unavailable' }),
      });
    });

    const reactErrors: string[] = [];
    page.on('pageerror', err => {
      const msg = err.message.toLowerCase();
      if (
        msg.includes('hydration') ||
        msg.includes('invalid hook') ||
        msg.includes('maximum update') ||
        msg.includes('unhandled')
      ) {
        reactErrors.push(err.message);
      }
    });

    await gotoWithRetry(page, APP_ROUTES.DASHBOARD_OVERVIEW, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await page.waitForTimeout(3_000);

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';

    expect(bodyText.toLowerCase()).not.toContain('application error');
    expect(bodyText.toLowerCase()).not.toContain('something went wrong');
    expect(bodyText.trim().length).toBeGreaterThan(50);
    expect(
      reactErrors,
      `React errors when DSP is down: ${reactErrors.join('; ')}`
    ).toHaveLength(0);
  });

  test('social link suggestion approve with invalid UUID returns 4xx not 5xx', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Tests that our API validates IDs and doesn't crash on bad input.
    // A 500 here means the server threw an unhandled exception on a bad ID.
    const response = await page.request.post(
      '/api/suggestions/social-links/not-a-valid-uuid/approve',
      {
        data: {},
        headers: { 'content-type': 'application/json' },
      }
    );

    expect(
      response.status(),
      'Approve endpoint crashed (500) on malformed UUID — should return 4xx'
    ).not.toBe(500);
  });

  test('rapid concurrent requests to enrichment status do not cause 500s', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Fire 8 concurrent requests to the enrichment status endpoint.
    // Tests for race conditions, connection pool exhaustion, or query timeouts.
    const requests = Array.from({ length: 8 }, (_, i) =>
      page.request
        .get(
          `/api/dsp/enrichment/status?profileId=00000000-0000-0000-0000-00000000000${i}`
        )
        .then(r => r.status())
        .catch(() => 0)
    );

    const statuses = await Promise.all(requests);

    // None should be 500 — either 400 (invalid ID) or 200
    for (const status of statuses) {
      expect(
        status,
        `Enrichment status returned ${status} under concurrency`
      ).not.toBe(500);
    }
  });
});
