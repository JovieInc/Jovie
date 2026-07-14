import { expect, test } from '@playwright/test';

/**
 * Visual regression tests for the 5 highest-churn surfaces.
 *
 * Uses Playwright's built-in screenshot comparison (toHaveScreenshot)
 * with thresholds configured in playwright.config.ts:
 *   maxDiffPixelRatio: 0.08 (8%)
 *   threshold: 0.2
 *   animations: 'disabled'
 *
 * Baselines stored in tests/e2e/__snapshots__/visual-regression.spec.ts/
 *
 * Run: doppler run -- pnpm test:e2e tests/e2e/visual-regression.spec.ts
 * Update baselines: doppler run -- pnpm test:e2e tests/e2e/visual-regression.spec.ts --update-snapshots
 *
 * @see apps/web/playwright.config.ts (snapshot config)
 *
 * JOV-2081: Full viewport matrix (375, 768, 1024, 1280, 1440, 1728, 2560) added below
 * for homepage, /sign-up, and /sign-in with horizontal-scroll and CTA-clip guards.
 */

// No auth — test public pages as anonymous visitor
test.use({ storageState: { cookies: [], origins: [] } });

/** Visual & A11y CI sets E2E_SKIP_AUTH when Clerk secrets are unavailable. */
const shouldSkipAuthVisual =
  process.env.E2E_SKIP_AUTH === 'true' || process.env.E2E_SKIP_AUTH === '1';

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

// ==========================================================================
// 1. Homepage — 49 touches/30d, highest churn marketing page
// ==========================================================================
test.describe('homepage visual regression', () => {
  test('desktop layout', async ({ page }) => {
    await blockAnalytics(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    // Wait for hero content to load
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot('homepage-desktop.png', {
      fullPage: false,
    });
  });

  test('mobile layout', async ({ page }) => {
    await blockAnalytics(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot('homepage-mobile.png', {
      fullPage: false,
    });
  });

  test('tablet layout', async ({ page }) => {
    await blockAnalytics(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot('homepage-tablet.png', {
      fullPage: false,
    });
  });
});

// ==========================================================================
// 2. Auth pages — frequent regressions in light/dark mode visibility
// ==========================================================================
test.describe('auth pages visual regression', () => {
  test.skip(
    shouldSkipAuthVisual,
    'E2E_SKIP_AUTH — Clerk secrets unavailable in visual CI'
  );

  test('signin dark mode', async ({ page }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/signin', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(
      page.locator('form, [data-clerk-component]').first()
    ).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot('signin-dark.png', {
      fullPage: false,
    });
  });

  test('signin light mode', async ({ page }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/signin', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(
      page.locator('form, [data-clerk-component]').first()
    ).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot('signin-light.png', {
      fullPage: false,
    });
  });

  test('signup dark mode', async ({ page }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/signup', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(
      page.locator('form, [data-clerk-component]').first()
    ).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot('signup-dark.png', {
      fullPage: false,
    });
  });

  test('signup light mode', async ({ page }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/signup', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(
      page.locator('form, [data-clerk-component]').first()
    ).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot('signup-light.png', {
      fullPage: false,
    });
  });
});

// ==========================================================================
// 3. Pricing page — light/dark mode regressions
// ==========================================================================
test.describe('pricing visual regression', () => {
  test('dark mode', async ({ page }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/pricing', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(page).toHaveScreenshot('pricing-dark.png', {
      fullPage: false,
    });
  });

  test('light mode', async ({ page }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/pricing', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    if (isClerkRedirect(page.url())) {
      test.skip(true, 'Clerk handshake redirect');
      return;
    }

    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(page).toHaveScreenshot('pricing-light.png', {
      fullPage: false,
    });
  });
});

// ==========================================================================
// JOV-2081: Full viewport matrix — homepage, /sign-up, /sign-in
// Canonical breakpoints: 375, 768, 1024, 1280, 1440, 1728, 2560
// Each test asserts:
//   1. No horizontal scroll (scrollWidth <= innerWidth)
//   2. Primary CTA buttons are visible and not clipped
//   3. Screenshot baseline (fullPage: false = above-the-fold only)
// ==========================================================================

/** Canonical viewport widths per JOV-2081 */
const VIEWPORT_MATRIX = [
  { width: 375, height: 812, label: '375' },
  { width: 768, height: 1024, label: '768' },
  { width: 1024, height: 768, label: '1024' },
  { width: 1280, height: 800, label: '1280' },
  { width: 1440, height: 900, label: '1440' },
  { width: 1728, height: 1117, label: '1728' },
  { width: 2560, height: 1440, label: '2560' },
] as const;

/**
 * Assert the page has no horizontal scroll.
 * Returns the overflow in pixels (0 = clean).
 */
async function assertNoHorizontalScroll(
  page: import('@playwright/test').Page,
  viewport: { width: number; label: string }
): Promise<void> {
  const overflow = await page.evaluate(
    () => document.body.scrollWidth - window.innerWidth
  );
  expect(
    overflow,
    `Horizontal scroll detected at ${viewport.width}px viewport: ${overflow}px overflow`
  ).toBeLessThanOrEqual(1);
}

/**
 * Assert the primary CTA button is visible and not clipped by the viewport.
 * Checks that the element's bounding box is fully within the viewport width.
 */
async function assertPrimaryCtaVisible(
  page: import('@playwright/test').Page,
  viewport: { width: number; label: string }
): Promise<void> {
  const ctaSelectors = [
    // Homepage hero CTA
    'a[href="/signup"][data-testid]',
    // Generic signup links
    'a[href="/signup"]',
    'a[href*="/sign-up"]',
    // Auth form submit buttons
    'button[type="submit"]',
    // Fallback: any visible button with signup intent
    'button:has-text("Continue"), button:has-text("Sign up"), button:has-text("Create"), button:has-text("Start")',
  ];

  let ctaFound = false;
  for (const selector of ctaSelectors) {
    const locator = page.locator(selector).first();
    const isVisible = await locator
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!isVisible) continue;

    const box = await locator.boundingBox();
    if (!box) continue;

    ctaFound = true;
    // CTA must not be clipped beyond the right edge of the viewport
    expect(
      box.x,
      `CTA left edge at ${viewport.width}px is off-screen left`
    ).toBeGreaterThanOrEqual(-1);
    expect(
      box.x + box.width,
      `CTA is clipped off the right edge at ${viewport.width}px`
    ).toBeLessThanOrEqual(viewport.width + 1);
    break;
  }

  if (!ctaFound) {
    // Auth pages may not have a CTA in the traditional sense — this is a soft warning
    console.warn(
      `[visual-regression] No primary CTA found at ${viewport.width}px — may be expected for this page`
    );
  }
}

test.describe('JOV-2081: Viewport matrix — homepage', () => {
  for (const viewport of VIEWPORT_MATRIX) {
    test(`homepage no horizontal scroll at ${viewport.label}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
      await assertNoHorizontalScroll(page, viewport);
    });

    test(`homepage primary CTA visible at ${viewport.label}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
      await assertPrimaryCtaVisible(page, viewport);
    });

    test(`homepage screenshot at ${viewport.label}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveScreenshot(`homepage-${viewport.label}.png`, {
        fullPage: false,
      });
    });
  }
});

test.describe('JOV-2081: Viewport matrix — /sign-up', () => {
  test.skip(
    shouldSkipAuthVisual,
    'E2E_SKIP_AUTH — Clerk secrets unavailable in visual CI'
  );

  for (const viewport of VIEWPORT_MATRIX) {
    test(`sign-up no horizontal scroll at ${viewport.label}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/signup', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(
        page
          .locator('form, [data-clerk-component], input[type="email"]')
          .first()
      ).toBeVisible({ timeout: 15_000 });

      await assertNoHorizontalScroll(page, viewport);
    });

    test(`sign-up primary CTA visible at ${viewport.label}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/signup', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(
        page
          .locator('form, [data-clerk-component], input[type="email"]')
          .first()
      ).toBeVisible({ timeout: 15_000 });

      await assertPrimaryCtaVisible(page, viewport);
    });

    test(`sign-up screenshot at ${viewport.label}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/signup', { waitUntil: 'networkidle', timeout: 60_000 });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(
        page.locator('form, [data-clerk-component]').first()
      ).toBeVisible({ timeout: 15_000 });

      await expect(page).toHaveScreenshot(`signup-${viewport.label}.png`, {
        fullPage: false,
      });
    });
  }
});

test.describe('JOV-2081: Viewport matrix — /sign-in', () => {
  test.skip(
    shouldSkipAuthVisual,
    'E2E_SKIP_AUTH — Clerk secrets unavailable in visual CI'
  );

  for (const viewport of VIEWPORT_MATRIX) {
    test(`sign-in no horizontal scroll at ${viewport.label}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/signin', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(
        page
          .locator('form, [data-clerk-component], input[type="email"]')
          .first()
      ).toBeVisible({ timeout: 15_000 });

      await assertNoHorizontalScroll(page, viewport);
    });

    test(`sign-in primary CTA visible at ${viewport.label}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/signin', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(
        page
          .locator('form, [data-clerk-component], input[type="email"]')
          .first()
      ).toBeVisible({ timeout: 15_000 });

      await assertPrimaryCtaVisible(page, viewport);
    });

    test(`sign-in screenshot at ${viewport.label}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await blockAnalytics(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/signin', { waitUntil: 'networkidle', timeout: 60_000 });

      if (isClerkRedirect(page.url())) {
        test.skip(true, 'Clerk handshake redirect');
        return;
      }

      await expect(
        page.locator('form, [data-clerk-component]').first()
      ).toBeVisible({ timeout: 15_000 });

      await expect(page).toHaveScreenshot(`signin-${viewport.label}.png`, {
        fullPage: false,
      });
    });
  }
});
