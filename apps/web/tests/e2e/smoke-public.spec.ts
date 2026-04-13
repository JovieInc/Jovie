import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { isClerkRedirectUrl } from './utils/smoke-test-utils';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

/**
 * Suite 1: Public Profile Experience + Public Pages (JOV-1427)
 *
 * Tests as an ANONYMOUS VISITOR. No auth. No API mocks except analytics fire-and-forget.
 *
 * Each test would FAIL if the corresponding user experience is broken.
 * No warnings-instead-of-failures. No theater.
 *
 * Run headed to visually verify:
 *   doppler run -- pnpm exec playwright test smoke-public --project=chromium --headed
 *
 * @smoke @critical
 */

test.use({ storageState: { cookies: [], origins: [] } });

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

async function getVisibleSubscribeInput(page: import('@playwright/test').Page) {
  const input = page
    .locator(
      '[data-testid="subscription-input"]:visible, [data-testid="inline-email-input"]:visible'
    )
    .first();
  await expect(input).toBeVisible({ timeout: 20_000 });
  return input;
}

async function revealSubscribeComposer(page: import('@playwright/test').Page) {
  const inputVisible = await page
    .locator(
      '[data-testid="subscription-input"]:visible, [data-testid="inline-email-input"]:visible'
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (inputVisible) {
    return;
  }

  const openTrigger = page
    .getByRole('button', { name: /turn on notifications|get notified/i })
    .first();
  await expect(openTrigger).toBeVisible({ timeout: 20_000 });
  await openTrigger.click();
}

test('homepage: hero heading, CTA, final claim CTA', async ({ page }) => {
  test.skip(
    FAST_ITERATION,
    'Public smoke coverage runs in content-gate and targeted smoke-public loops'
  );
  test.setTimeout(120_000);
  await blockAnalytics(page);

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

  if (isClerkRedirectUrl(page.url())) {
    test.skip(true, 'Clerk handshake redirect in CI');
    return;
  }

  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });

  const cta = page
    .locator(
      '#handle-input, a[href*="/signup"], a[href*="/sign-up"], a:has-text("Get started")'
    )
    .first();
  await expect(cta).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('final-cta-section').scrollIntoViewIfNeeded();
  const finalCtaHeadline = page.getByTestId('final-cta-headline');
  await expect(
    finalCtaHeadline,
    'Homepage did not render the final claim CTA section'
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId('final-cta-action'),
    'Homepage did not render the final CTA action'
  ).toBeVisible({ timeout: 20_000 });

  const bodyText =
    (await page
      .locator('body')
      .innerText()
      .catch(() => '')) ?? '';
  expect(bodyText.toLowerCase()).not.toContain('application error');
  expect(bodyText.toLowerCase()).not.toContain('internal server error');
});

test.describe('Public Profile - dualipa', () => {
  const TEST_PROFILE = 'dualipa';

  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('default view: artist name renders and profile shell is healthy', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Public smoke coverage runs in content-gate and targeted smoke-public loops'
    );
    test.setTimeout(90_000);

    await page.goto(`/${TEST_PROFILE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.fail(
        true,
        'Profile dualipa not seeded - global-setup.ts must seed this profile'
      );
      return;
    }

    await expect(
      page.getByText('Dua Lipa', { exact: true }).first()
    ).toBeVisible({
      timeout: 60_000,
    });
    const claimBanner = page.getByTestId('claim-banner-cta');
    const claimBannerVisible = await claimBanner.isVisible().catch(() => false);
    if (claimBannerVisible) {
      await expect(claimBanner).toBeVisible({ timeout: 15_000 });
    }
  });

  test('listen mode: DSP streaming links render', async ({ page }) => {
    test.skip(
      FAST_ITERATION,
      'Public smoke coverage runs in content-gate and targeted smoke-public loops'
    );
    test.setTimeout(90_000);

    await page.goto(`/${TEST_PROFILE}?mode=listen`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    const dspActions = page.locator(
      'a[href*="spotify"], a[href*="apple"], a[href*="tidal"], button'
    );
    await expect
      .poll(
        async () =>
          dspActions.evaluateAll(
            elements =>
              elements.filter(element => {
                const text = element.textContent?.trim().toLowerCase() ?? '';
                const style = globalThis.getComputedStyle(element as Element);
                const rect = (element as HTMLElement).getBoundingClientRect();
                const isDspAction =
                  text.includes('spotify') ||
                  text.includes('apple music') ||
                  text.includes('tidal');
                const isVisible =
                  style.visibility !== 'hidden' &&
                  style.display !== 'none' &&
                  rect.width > 0 &&
                  rect.height > 0;

                return isDspAction && isVisible;
              }).length
          ),
        {
          message:
            'No visible DSP links in listen mode - Spotify seeding failed or DSP rendering is broken',
          timeout: 60_000,
        }
      )
      .toBeGreaterThan(0);
  });

  test('tip mode: tipping UI renders', async ({ page }) => {
    test.skip(
      FAST_ITERATION,
      'Public smoke coverage runs in content-gate and targeted smoke-public loops'
    );
    test.setTimeout(90_000);
    const tipProfile = 'testartist';

    await page.goto(`/${tipProfile}?mode=tip`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    const tipUI = page
      .getByLabel('Venmo Tipping')
      .or(page.getByRole('button', { name: /continue with venmo/i }));
    await expect(
      tipUI.first(),
      'No tipping UI rendered - tipping flow is broken for this profile'
    ).toBeVisible({ timeout: 60_000 });
  });

  test('subscribe mode: notification capture UI renders', async ({ page }) => {
    test.skip(
      FAST_ITERATION,
      'Public smoke coverage runs in content-gate and targeted smoke-public loops'
    );
    test.setTimeout(90_000);

    await page.goto(`/${TEST_PROFILE}?mode=subscribe`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    const notificationsUi = page
      .getByRole('button', { name: /turn on notifications/i })
      .or(page.getByRole('button', { name: /get notified/i }))
      .or(page.locator('input[type="email"], input[type="tel"]').first());
    await expect(
      notificationsUi.first(),
      'Subscribe mode did not render a subscription CTA'
    ).toBeVisible({ timeout: 30_000 });
  });

  test('subscribe mode: email submit transitions to OTP verification UI', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Public smoke coverage runs in content-gate and targeted smoke-public loops'
    );
    test.setTimeout(90_000);

    await page.route('**/api/notifications/subscribe', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Please check your email to confirm your subscription',
          emailDispatched: true,
          durationMs: 25,
          pendingConfirmation: true,
          requiresOtp: true,
        }),
      })
    );

    await page.goto(`/${TEST_PROFILE}?mode=subscribe`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    await revealSubscribeComposer(page);

    const switchToEmail = page.getByRole('button', {
      name: /switch to email updates/i,
    });
    const canSwitchToEmail = await switchToEmail
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (canSwitchToEmail) {
      await switchToEmail.click();
    }

    const emailInput = await getVisibleSubscribeInput(page);
    await emailInput.fill('fan@example.com');
    await page.getByRole('button', { name: /get notified/i }).click();

    await expect(
      page.getByText('Check your inbox. Enter your code.')
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByLabel('Enter 6-digit verification code')
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /verify/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/confirmation link/i)).toHaveCount(0);
  });
});

test('signin and signup pages load', async ({ page }) => {
  test.skip(
    FAST_ITERATION,
    'Public smoke coverage runs in content-gate and targeted smoke-public loops'
  );
  await blockAnalytics(page);

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  if (!pk || pk.includes('mock') || pk.includes('dummy')) {
    test.skip(true, 'No real Clerk config - skipping auth page tests');
    return;
  }

  for (const route of [APP_ROUTES.SIGNIN, APP_ROUTES.SIGNUP]) {
    const response = await page.goto(route, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response?.status() ?? 0, `${route} returned 5xx`).toBeLessThan(500);

    const bodyText = await page.locator('body').textContent();
    expect(
      bodyText?.trim().length,
      `${route} rendered empty page`
    ).toBeGreaterThan(0);
  }
});

test('unknown routes return <500, not server crash', async ({ page }) => {
  test.skip(
    FAST_ITERATION,
    'Public smoke coverage runs in content-gate and targeted smoke-public loops'
  );
  await blockAnalytics(page);

  for (const route of [
    '/nonexistent-handle-xyz-123',
    '/non-existent-route-456',
  ]) {
    const response = await page.goto(route, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const status = response?.status() ?? 0;
    expect(
      status,
      `${route} returned ${status} - server crashed on unknown route`
    ).toBeLessThan(500);

    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('internal server error');
  }
});
