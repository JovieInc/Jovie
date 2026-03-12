import { expect, test } from '@playwright/test';

/**
 * Intentional red lane for Sentry/Linear generation.
 *
 * These tests deliberately fail after triggering known Sentry example surfaces so
 * the app emits its own Sentry events and the Playwright Sentry reporter emits a
 * deterministic failed-test event on the final retry.
 */

test.use({ storageState: { cookies: [], origins: [] } });
const isFastIteration = process.env.E2E_FAST_ITERATION === '1';

test.describe('Sentry Red Lane @sentry @red', () => {
  test.skip(
    isFastIteration,
    'Red lane runs separately from the green fast sweep'
  );

  test('frontend example button triggers a page error and fails intentionally', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const pageErrors: string[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    await page.goto('/sentry-example-page', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await expect(
      page.getByRole('button', { name: /throw sample error/i })
    ).toBeVisible({ timeout: 15_000 });

    const throwButton = page.getByRole('button', {
      name: /throw sample error/i,
    });
    const buttonEnabled = await throwButton.isEnabled().catch(() => false);

    if (buttonEnabled) {
      await throwButton.click();
    }

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Intentional red lane browser error');
      }, 0);
    });

    await expect
      .poll(() => pageErrors.length, {
        timeout: 15_000,
        message:
          'Expected a frontend pageerror after clicking the sample button',
      })
      .toBeGreaterThan(0);

    throw new Error(
      `Intentional red lane failure after frontend trigger: buttonEnabled=${buttonEnabled} pageError=${pageErrors[0] ?? 'none'}`
    );
  });

  test('backend example API throws and fails intentionally', async ({
    page,
  }) => {
    test.setTimeout(30_000);

    const response = await page.request.get('/api/sentry-example-api');
    const body = await response.text().catch(() => '<unreadable>');

    expect(response.status(), 'Expected the sample API route to error').toBe(
      500
    );

    throw new Error(
      `Intentional red lane failure after backend Sentry trigger: status=${response.status()} body=${body.slice(0, 200)}`
    );
  });
});
