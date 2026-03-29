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
 * Baselines stored in tests/e2e/visual-regression.spec.ts-snapshots/
 *
 * Run: doppler run -- pnpm test:e2e tests/e2e/visual-regression.spec.ts
 * Update baselines: doppler run -- pnpm test:e2e tests/e2e/visual-regression.spec.ts --update-snapshots
 *
 * @see apps/web/playwright.config.ts (snapshot config)
 */

// No auth — test public pages as anonymous visitor
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
