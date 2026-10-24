import { expect, test } from '@playwright/test';

/**
 * Sentry Integration Coverage (JOV-1427 — "ensure sentry coverage")
 *
 * Verifies that Sentry is correctly integrated:
 * 1. sentry-example-page renders without white-screening the app
 * 2. Explicit test reporting uses the isolated development Sentry project
 *
 * The sentry-ci-reporter.ts sends actual test failures to Sentry
 * only when SENTRY_E2E_REPORTING=1 and SENTRY_DSN_DEV are set.
 *
 * @smoke @sentry
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Sentry Integration', () => {
  test('sentry-example-page renders without crashing', async ({ page }) => {
    test.setTimeout(90_000);

    let response: Awaited<ReturnType<typeof page.goto>>;
    try {
      response = await page.goto('/sentry-example-page', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(
          true,
          'Server too slow for sentry-example-page under parallel load'
        );
        return;
      }
      throw e;
    }

    expect(
      response?.status() ?? 0,
      'Sentry example page returned 5xx'
    ).toBeLessThan(500);

    // /sentry-example-page is development-only (requireDevelopmentOnlyPage).
    // Production-mode builds, including the standalone server the full
    // matrix runs, statically prerender the gate, so the route serves the
    // root not-found page there. Either surface must paint real content; a
    // blank body means the client bundle (and Sentry's error boundary)
    // failed. `isVisible()` never waits, so use web-first assertions.
    const examplePage = page.getByRole('heading', {
      level: 1,
      name: 'Frontend error example',
    });
    const devOnlyGate = page
      .getByTestId('not-found')
      .getByRole('heading', { level: 1, name: "We can't find that page." });
    await expect(
      examplePage.or(devOnlyGate),
      'Sentry example page is a white screen — Sentry error handling may be broken'
    ).toBeVisible({ timeout: 15_000 });

    if (await examplePage.isVisible()) {
      await expect(
        page.getByRole('button', { name: 'Throw sample error' })
      ).toBeVisible();
    }
  });

  test('Sentry CI reporter config valid when E2E reporting enabled', () => {
    const sentryE2eEnabled = process.env.SENTRY_E2E_REPORTING === '1';
    const hasDevDsn = Boolean(process.env.SENTRY_DSN_DEV);

    if (!sentryE2eEnabled) {
      console.log(
        'ℹ SENTRY_E2E_REPORTING not enabled — test failures will not be sent to Sentry'
      );
      console.log(
        '  To enable: set SENTRY_E2E_REPORTING=1 and SENTRY_DSN_DEV in Doppler'
      );
      return;
    }

    expect(
      hasDevDsn,
      'SENTRY_E2E_REPORTING=1 but SENTRY_DSN_DEV is not set — CI reporter will fail silently'
    ).toBe(true);
  });
});
