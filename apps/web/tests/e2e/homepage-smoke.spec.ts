import { expect, test } from './setup';

/**
 * Homepage Smoke Test
 *
 * CRITICAL: This test runs BEFORE production deploys to prevent broken homepages
 * from reaching production. It verifies the homepage renders without errors.
 *
 * If this test fails, the deploy will be blocked.
 *
 * @smoke
 * @critical
 */
test.describe('Homepage Smoke @smoke @critical', () => {
  test('homepage loads without server errors', async ({ page }) => {
    // Monitor for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected errors
        const isClerkError = text.toLowerCase().includes('clerk');
        const isNetworkResourceError = text.includes('Failed to load resource');
        const isCspError =
          text.toLowerCase().includes('content security policy') ||
          text.toLowerCase().includes('csp');

        if (!isClerkError && !isNetworkResourceError && !isCspError) {
          consoleErrors.push(text);
        }
      }
    });

    // Navigate to homepage
    const response = await page.goto('/', { timeout: 30000 });

    // CRITICAL: Must not be a server error (5xx)
    const status = response?.status() ?? 0;
    expect(status, `Homepage returned ${status} - server error!`).toBeLessThan(
      500
    );

    // Must return 200 OK
    expect(status, `Homepage returned ${status} - expected 200`).toBe(200);

    // Wait for page to be interactive
    await page.waitForLoadState('domcontentloaded');

    // Assert no unexpected console errors
    expect(
      consoleErrors,
      `Homepage has unexpected console errors: ${consoleErrors.join(', ')}`
    ).toHaveLength(0);
  });

  test('homepage renders main content', async ({ page }) => {
    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');

    // Verify body has content (not blank page)
    const bodyContent = await page.locator('body').textContent();
    expect(
      bodyContent && bodyContent.length > 100,
      'Homepage body is empty or too short'
    ).toBe(true);

    // Verify main heading exists (h1)
    const h1 = page.locator('h1').first();
    await expect(h1, 'Homepage missing h1 heading').toBeVisible({
      timeout: 10000,
    });

    // Verify it's not an error page
    const pageText = bodyContent?.toLowerCase() ?? '';
    expect(
      !pageText.includes('application error') &&
        !pageText.includes('internal server error') &&
        !pageText.includes('something went wrong'),
      'Homepage shows error message'
    ).toBe(true);
  });

  test('homepage has no React hydration errors', async ({ page }) => {
    const hydrationErrors: string[] = [];

    page.on('console', msg => {
      const text = msg.text();
      if (
        text.includes('Hydration failed') ||
        text.includes('hydration mismatch') ||
        text.includes('Text content does not match') ||
        text.includes('did not match')
      ) {
        hydrationErrors.push(text);
      }
    });

    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('load');

    // Allow a brief moment for any late hydration errors
    await page.waitForTimeout(1000);

    expect(
      hydrationErrors,
      `Homepage has hydration errors: ${hydrationErrors.join(', ')}`
    ).toHaveLength(0);
  });

  test('homepage critical elements are visible', async ({ page }) => {
    await page.goto('/', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');

    // Verify page has substantial content (not blank)
    const bodyText = await page.locator('body').textContent();
    expect(
      bodyText && bodyText.length > 100,
      'Homepage body is empty or too short'
    ).toBe(true);

    // Check for logo using data-testid (more reliable than generic svg/img selector)
    const logo = page.getByTestId('site-logo');
    const logoLink = page.getByTestId('site-logo-link');

    // First try the data-testid approach (preferred)
    const hasLogoByTestId = await logo.isVisible().catch(() => false);
    const hasLogoLinkByTestId = await logoLink.isVisible().catch(() => false);

    // Fallback to generic selector if data-testid not found (backwards compatibility)
    const hasLogoGeneric =
      !hasLogoByTestId &&
      ((await page
        .locator('svg')
        .first()
        .isVisible()
        .catch(() => false)) ||
        (await page
          .locator('img')
          .first()
          .isVisible()
          .catch(() => false)));

    expect(
      hasLogoByTestId || hasLogoLinkByTestId || hasLogoGeneric,
      'Homepage missing logo/icon'
    ).toBe(true);

    // Check for main CTA or navigation
    const hasInteractiveElement =
      (await page
        .locator('button')
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await page
        .locator('a[href]')
        .first()
        .isVisible()
        .catch(() => false));

    expect(hasInteractiveElement, 'Homepage missing interactive elements').toBe(
      true
    );

    // Check for header navigation
    const header = page.getByTestId('header-nav');
    const hasHeader = await header.isVisible().catch(() => false);
    expect(hasHeader, 'Homepage missing header navigation').toBe(true);
  });
});
