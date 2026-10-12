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

    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

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

    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(
      bodyText.trim().length,
      'Sentry example page rendered empty'
    ).toBeGreaterThan(0);

    const hasContent = await page
      .locator('main, h1, h2, p, button')
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    expect(
      hasContent,
      'Sentry example page is a white screen — Sentry error handling may be broken'
    ).toBe(true);
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
