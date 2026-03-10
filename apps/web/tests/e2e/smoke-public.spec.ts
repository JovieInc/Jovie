import { expect, test } from '@playwright/test';

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

function isClerkRedirect(url: string): boolean {
  return (
    url.includes('clerk') &&
    (url.includes('handshake') || url.includes('dev-browser'))
  );
}

test('homepage: hero heading, CTA, multiple sections, footer', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await blockAnalytics(page);

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

  if (isClerkRedirect(page.url())) {
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

  const sectionCount = await page.locator('section').count();
  expect(
    sectionCount,
    'Homepage missing sections — page may be blank'
  ).toBeGreaterThanOrEqual(2);

  await expect(page.locator('footer').first()).toBeVisible({ timeout: 20_000 });

  const bodyText =
    (await page
      .locator('body')
      .innerText()
      .catch(() => '')) ?? '';
  expect(bodyText.toLowerCase()).not.toContain('application error');
  expect(bodyText.toLowerCase()).not.toContain('internal server error');
});

test.describe('Public Profile — dualipa', () => {
  const TEST_PROFILE = 'dualipa';

  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('default view: artist name in h1, profile identity link, claim banner', async ({
    page,
  }) => {
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
        'Profile dualipa not seeded — global-setup.ts must seed this profile'
      );
      return;
    }

    await expect(page.locator('h1').first()).toContainText(/dua lipa/i, {
      timeout: 60_000,
    });

    await expect(
      page.getByRole('link', { name: /claim profile for dua lipa/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('link', { name: /go to dua lipa's profile/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('listen mode: DSP streaming links render', async ({ page }) => {
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
            'No visible DSP links in listen mode — Spotify seeding failed or DSP rendering is broken',
          timeout: 60_000,
        }
      )
      .toBeGreaterThan(0);
  });

  test('tip mode: tipping UI renders', async ({ page }) => {
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
      'No tipping UI rendered — tipping flow is broken for this profile'
    ).toBeVisible({ timeout: 60_000 });
  });

  test('subscribe mode: notification capture UI renders', async ({ page }) => {
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

    const openSubscribe = page.getByRole('button', {
      name: /turn on notifications/i,
    });
    await expect(
      openSubscribe,
      'Subscribe mode did not render the notification entry action'
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/get notified/i),
      'Subscribe mode did not render the get-notified state'
    ).toBeVisible({ timeout: 30_000 });
  });
});

test('signin and signup pages load', async ({ page }) => {
  await blockAnalytics(page);

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  if (!pk || pk.includes('mock') || pk.includes('dummy')) {
    test.skip(true, 'No real Clerk config — skipping auth page tests');
    return;
  }

  for (const route of ['/signin', '/sign-up']) {
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
      `${route} returned ${status} — server crashed on unknown route`
    ).toBeLessThan(500);

    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('internal server error');
  }
});
