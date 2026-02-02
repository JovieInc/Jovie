import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Homepage Tests
 *
 * NOTE: Tests public homepage for unauthenticated visitors.
 * Must run without saved authentication.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Wait for React to fully hydrate using deterministic method
    await waitForHydration(page);
  });

  test('displays the main hero section', async ({ page }) => {
    // Check main headline
    await expect(page.locator('h1')).toContainText(
      'The link in bio your music deserves'
    );

    // Check lead text
    await expect(
      page.getByText(
        'Capture every fan with an AI-powered profile that updates itself.'
      )
    ).toBeVisible();

    // Check supporting text
    await expect(page.getByText('Free to start. Zero setup.')).toBeVisible();
  });

  test('displays the hero CTA buttons', async ({ page }) => {
    // Check "Request early access" button in hero (not header)
    const heroSection = page.locator('main section').first();
    const earlyAccessButton = heroSection.getByRole('link', {
      name: /Request early access/i,
    });
    await expect(earlyAccessButton).toBeVisible();
    await expect(earlyAccessButton).toHaveAttribute('href', '/waitlist');

    // Check "See how it works" button
    const howItWorksButton = heroSection.getByRole('link', {
      name: /See how it works/i,
    });
    await expect(howItWorksButton).toBeVisible();
    await expect(howItWorksButton).toHaveAttribute('href', '#how-it-works');
  });

  test('displays the content sections', async ({ page }) => {
    // Check that main sections load (deferred sections may not be visible immediately)
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Verify hero section is visible
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // Verify page has content (not blank)
    expect(body && body.length > 500).toBe(true);
  });

  test('displays the page with sections', async ({ page }) => {
    // Check that page has multiple sections
    const sections = page.locator('section');
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThan(1);

    // Verify page isn't blank
    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 1000).toBe(true);
  });

  test('displays multiple sections', async ({ page }) => {
    // Scroll through page to load deferred sections
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);

    // Check for section elements
    const sections = page.locator('section');
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThan(1);
  });

  test('has proper navigation elements', async ({ page }) => {
    // Check for header navigation
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check for logo/brand link
    const logoLink = page.locator('a[href="/"]').first();
    await expect(logoLink).toBeVisible();
  });

  test('has proper meta information', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Jovie/);

    // Check meta description exists
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content');
  });

  test('is responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that main content is visible
    await expect(page.locator('h1')).toContainText(
      'The link in bio your music deserves',
      {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      }
    );

    // Check that CTAs are visible
    const earlyAccessButton = page.getByRole('link', {
      name: /Request early access/i,
    });
    await expect(earlyAccessButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('has proper accessibility features', async ({ page }) => {
    // Check for proper heading structure
    const headings = page.locator('h1, h2, h3');
    await expect(headings.first()).toContainText(
      'The link in bio your music deserves'
    );

    // Check for proper link labels in hero
    const heroSection = page.locator('main section').first();
    const earlyAccessLink = heroSection.getByRole('link', {
      name: /Request early access/i,
    });
    await expect(earlyAccessLink).toBeVisible();

    // Check for proper image alt texts (logo in header should exist)
    const headerLogo = page.locator('header img, header svg').first();
    await expect(headerLogo).toBeVisible();
  });

  test('has proper loading states', async ({ page }) => {
    // Check that page loads without errors
    await expect(page.locator('body')).not.toContainText('Error');
    await expect(page.locator('body')).not.toContainText('Loading...');

    // Check that main content is visible
    await expect(page.locator('h1')).toBeVisible();
  });
});
