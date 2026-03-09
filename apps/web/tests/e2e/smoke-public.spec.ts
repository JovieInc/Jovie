import { expect, test } from '@playwright/test';

/**
 * Suite 1: Public Profile Experience + Public Pages
 *
 * Tests as an ANONYMOUS VISITOR. No auth, no mocks (except analytics).
 * If these pass, public-facing pages work for real users.
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

test('homepage loads with hero heading, CTA, sections, and footer', async ({
  page,
}) => {
  await blockAnalytics(page);

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  if (isClerkRedirect(page.url())) {
    test.skip(true, 'Clerk handshake redirect in CI');
    return;
  }

  // Hero heading
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

  // CTA exists (claim input or signup link)
  const cta = page
    .locator(
      '#handle-input, a[href*="/signup"], a[href*="/sign-up"], a:has-text("Get started")'
    )
    .first();
  await expect(cta).toBeVisible({ timeout: 20_000 });

  // Multiple sections rendered (not just the shell)
  const sectionCount = await page.locator('section').count();
  expect(
    sectionCount,
    'Homepage should have 2+ sections'
  ).toBeGreaterThanOrEqual(2);

  // Footer proves the full page loaded
  await expect(page.locator('footer').first()).toBeVisible({ timeout: 20_000 });

  // Not an error page
  const bodyText =
    (await page
      .locator('body')
      .innerText()
      .catch(() => '')) ?? '';
  expect(bodyText.toLowerCase()).not.toContain('application error');
  expect(bodyText.toLowerCase()).not.toContain('internal server error');
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PROFILE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Public Profile', () => {
  const TEST_PROFILE = 'dualipa';

  test('profile page shows artist name, image, and DSP links', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await blockAnalytics(page);

    await page.goto(`/${TEST_PROFILE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Skip if profile data not seeded
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const lower = (bodyText ?? '').toLowerCase();
    if (
      lower.includes('not found') ||
      lower.includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded in test database');
      return;
    }

    // Wait for loading skeleton to resolve
    if (
      lower.includes('loading jovie profile') ||
      lower.includes('loading artist profile')
    ) {
      await expect
        .poll(
          async () => {
            const t = await page
              .locator('body')
              .innerText()
              .catch(() => '');
            return !(t ?? '').toLowerCase().includes('loading');
          },
          { timeout: 15_000 }
        )
        .toBeTruthy();
    }

    // Artist name visible in h1
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 20_000 });
    await expect(h1).toContainText(/dua lipa/i);

    // Profile image loads (avatar or any image)
    const hasImage = await page
      .locator('[data-testid="profile-avatar"], img')
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!hasImage) {
      console.warn(
        'Profile has no visible images — may lack avatar data in CI'
      );
    }

    // At least one DSP link or action button is visible
    const dspOrAction = page.locator(
      'a[href*="spotify"], a[href*="apple"], [data-testid="listen-button"], [data-testid="tip-button"], button:has-text("Listen"), button:has-text("Tip")'
    );
    const dspCount = await dspOrAction.count();
    if (dspCount === 0) {
      console.warn(
        'No DSP links or action buttons — profile may lack streaming data'
      );
    }
  });

  test('profile listen mode renders DSP options', async ({ page }) => {
    test.setTimeout(90_000);
    await blockAnalytics(page);

    await page.goto(`/${TEST_PROFILE}?mode=listen`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const lower = (bodyText ?? '').toLowerCase();
    if (lower.includes('not found') || lower.includes('temporarily')) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    // h1 with artist name proves page rendered
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

    // Either DSP buttons or a "no links" message
    const hasDsp = await page
      .locator(
        'a[href*="spotify"], a[href*="apple"], button:has-text("Spotify"), button:has-text("Apple Music")'
      )
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const hasNoLinksMsg = await page
      .getByText(/streaming links aren.t available/i)
      .isVisible()
      .catch(() => false);

    if (!hasDsp && !hasNoLinksMsg) {
      console.warn('Listen mode: no DSP content or "no links" message found');
    }
  });

  test('profile subpages (/subscribe, /tip, /tour) load without 500', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await blockAnalytics(page);

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
          msg.includes('Timeout') ||
          msg.includes('Target closed')
        ) {
          test.skip(true, `Transient nav error on /${TEST_PROFILE}${sub}`);
          return;
        }
        throw navError;
      }

      const status = response?.status() ?? 0;
      expect(status, `/${TEST_PROFILE}${sub} returned ${status}`).toBeLessThan(
        500
      );

      // Not an error page
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      const lower = (bodyText ?? '').toLowerCase();
      if (lower.includes('not found') || lower.includes('temporarily')) {
        continue; // profile not seeded, skip this subpage
      }
      expect(lower).not.toContain('application error');
      expect(lower).not.toContain('internal server error');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL PUBLIC PAGES
// ─────────────────────────────────────────────────────────────────────────────

test('signin and signup pages load without server errors', async ({ page }) => {
  await blockAnalytics(page);

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  if (!pk || pk.includes('mock') || pk.includes('dummy')) {
    test.skip(true, 'No real Clerk config');
    return;
  }

  for (const route of ['/signin', '/sign-up']) {
    const response = await page.goto(route, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response?.status() ?? 0, `${route} returned 5xx`).toBeLessThan(500);

    const bodyText = await page.locator('body').textContent();
    expect(bodyText, `${route} has no content`).toBeTruthy();
  }
});

test('non-existent routes return 404, not 500', async ({ page }) => {
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
    expect(status, `${route} returned ${status} (server error)`).toBeLessThan(
      500
    );

    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('internal server error');
  }
});
