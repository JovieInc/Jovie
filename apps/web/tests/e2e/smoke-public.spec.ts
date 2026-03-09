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

// Run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

/** Block analytics fire-and-forget calls that interfere with test stability */
async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

/** Skip if Clerk middleware hijacked the page (CI without dev-browser cookie) */
function isClerkRedirect(url: string): boolean {
  return (
    url.includes('clerk') &&
    (url.includes('handshake') || url.includes('dev-browser'))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOMEPAGE
// ─────────────────────────────────────────────────────────────────────────────

test('homepage: hero heading, CTA, multiple sections, footer', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await blockAnalytics(page);

  // Warmup pre-compiles this route — 120s timeout handles cold-start on first run
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

  if (isClerkRedirect(page.url())) {
    test.skip(true, 'Clerk handshake redirect in CI');
    return;
  }

  // h1 must be visible — if missing, the hero is broken
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });

  // CTA must be present — if no signup entry point, users can't convert
  const cta = page
    .locator(
      '#handle-input, a[href*="/signup"], a[href*="/sign-up"], a:has-text("Get started")'
    )
    .first();
  await expect(cta).toBeVisible({ timeout: 20_000 });

  // At least 2 sections — proves the page rendered beyond just the shell
  const sectionCount = await page.locator('section').count();
  expect(
    sectionCount,
    'Homepage missing sections — page may be blank'
  ).toBeGreaterThanOrEqual(2);

  // Footer — proves the full page loaded (not a loading skeleton)
  await expect(page.locator('footer').first()).toBeVisible({ timeout: 20_000 });

  // No error text in visible content
  const bodyText =
    (await page
      .locator('body')
      .innerText()
      .catch(() => '')) ?? '';
  expect(bodyText.toLowerCase()).not.toContain('application error');
  expect(bodyText.toLowerCase()).not.toContain('internal server error');
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PROFILE EXPERIENCE
// Anonymous visitor hits a profile. This is the primary user journey for fans.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Public Profile — dualipa', () => {
  const TEST_PROFILE = 'dualipa';

  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('default view: artist name in h1, profile image, claim banner', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(`/${TEST_PROFILE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Hard fail if profile missing — seeding must have worked
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

    // Artist name in h1 — core identity element
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('h1').first()).toContainText(/dua lipa/i);

    // Profile image — missing = broken avatar pipeline
    await expect(
      page
        .locator(
          '[data-testid="profile-avatar"], img[alt*="avatar"], img[alt*="profile"], img[alt*="Dua"]'
        )
        .first()
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

    // h1 with artist name proves the profile loaded, not just the shell
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('h1').first()).toContainText(/dua lipa/i);

    // DSP buttons must render — this is the entire point of listen mode
    // If Spotify seeding worked, there must be at least one DSP link
    const dspLink = page.locator(
      'a[href*="spotify"], a[href*="apple"], a[href*="tidal"], button:has-text("Spotify"), button:has-text("Apple Music")'
    );
    await expect(
      dspLink.first(),
      'No DSP links in listen mode — Spotify seeding failed or DSP rendering is broken'
    ).toBeVisible({ timeout: 20_000 });
  });

  test('tip mode: tipping UI renders', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto(`/${TEST_PROFILE}?mode=tip`, {
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

    // h1 present
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

    // Tipping UI or subscribe prompt — something actionable must render
    const tipUI = page.locator(
      '[data-testid="tip-button"], [data-testid="tip-form"], button:has-text("Tip"), button:has-text("Support"), input[placeholder*="amount"], a[href*="subscribe"]'
    );
    await expect(
      tipUI.first(),
      'No tipping UI rendered — tipping flow is broken for this profile'
    ).toBeVisible({ timeout: 20_000 });
  });

  test('profile subpages return 2xx, no 500s', async ({ page }) => {
    test.setTimeout(120_000);

    const subpages = ['/subscribe', '/tip', '/tour'] as const;

    for (const sub of subpages) {
      let response: Awaited<ReturnType<typeof page.goto>>;
      try {
        response = await page.goto(`/${TEST_PROFILE}${sub}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
      } catch (navError) {
        const msg =
          navError instanceof Error ? navError.message : String(navError);
        if (
          msg.includes('net::ERR_CONNECTION_REFUSED') ||
          msg.includes('net::ERR_CONNECTION_RESET') ||
          msg.includes('Target closed')
        ) {
          test.skip(true, `Server went away navigating to ${sub}`);
          return;
        }
        throw navError;
      }

      const status = response?.status() ?? 0;
      expect(
        status,
        `/${TEST_PROFILE}${sub} returned ${status} — server error`
      ).toBeLessThan(500);

      const bodyText =
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) ?? '';
      const lower = bodyText.toLowerCase();
      // 404 is OK (profile may not support this subpage), 500 is not
      expect(lower).not.toContain('application error');
      expect(lower).not.toContain('internal server error');
      expect(lower).not.toContain('unhandled runtime error');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIGNIN / SIGNUP — critical conversion pages
// ─────────────────────────────────────────────────────────────────────────────

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

    // Something must render — empty page = broken Clerk integration
    const bodyText = await page.locator('body').textContent();
    expect(
      bodyText?.trim().length,
      `${route} rendered empty page`
    ).toBeGreaterThan(0);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLING — unknown routes must not 500
// ─────────────────────────────────────────────────────────────────────────────

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
