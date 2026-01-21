import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Wait for React to fully hydrate using deterministic method
    await waitForHydration(page);
  });

  test('displays the main hero section', async ({ page }) => {
    // Check main headline
    await expect(page.locator('h1')).toContainText('Link in bio');
    await expect(page.locator('h1')).toContainText('for music artists');

    // Check subheadline
    await expect(
      page.getByText('Connect your music, social media, and merch in one link')
    ).toBeVisible();
    await expect(page.getByText('No design needed')).toBeVisible();

    // Check badge
    await expect(page.getByText('90-second setup')).toBeVisible();

    // Check social proof
    await expect(page.getByText('Free forever')).toBeVisible();
    await expect(page.getByText('High converting')).toBeVisible();
  });

  test('shows the artist search functionality', async ({ page }) => {
    // Check search input
    await expect(page.getByPlaceholder('Search artists...')).toBeVisible();
    await expect(page.getByText('Find your artist')).toBeVisible();

    // Check claim button (should be disabled initially)
    const claimButton = page.getByRole('button', { name: 'Select artist' });
    await expect(claimButton).toBeVisible();
    await expect(claimButton).toBeDisabled();
  });

  test('displays the features section', async ({ page }) => {
    // Check feature cards
    await expect(page.getByText('Fast Setup')).toBeVisible();
    await expect(page.getByText('Live in 90 seconds')).toBeVisible();

    await expect(page.getByText('High Converting')).toBeVisible();
    await expect(page.getByText('Optimized for engagement')).toBeVisible();

    await expect(page.getByText('Analytics')).toBeVisible();
    await expect(page.getByText('Track views and engagement')).toBeVisible();
  });

  test('shows the featured artists carousel', async ({ page }) => {
    // Check if artist carousel is present
    await expect(
      page.locator('section').filter({ hasText: 'Featured Artists' })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Check if artist images are displayed
    const artistImages = page.locator('img[alt*="Music Artist"]');
    await expect(artistImages.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Check if carousel is scrollable (use role-based or semantic selector)
    const carousel = page.locator(
      '[data-testid="artist-carousel"], [role="region"][aria-label*="carousel"], .overflow-x-auto'
    );
    await expect(carousel.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('shows problem and solution sections', async ({ page }) => {
    const section = page.locator('#problem');
    await expect(section.getByRole('heading', { level: 2 })).toContainText(
      'Your bio link is a speed bump.'
    );
    await expect(section).toContainText('Every extra tap taxes attention.');
    await expect(section.getByRole('heading', { level: 3 })).toContainText(
      'Stop designing. Start converting.'
    );
    await expect(section).toContainText(
      'Jovie ships a locked, elite artist page in seconds'
    );
    await expect(
      section.getByRole('link', { name: /Request Early Access/ })
    ).toBeVisible();
  });

  test('has proper navigation elements', async ({ page }) => {
    // Check header navigation is present
    const header = page.getByTestId('header-nav');
    await expect(header).toBeVisible();

    // Check if logo link is present and accessible
    const logoLink = page.getByTestId('site-logo-link');
    await expect(logoLink).toBeVisible();
    await expect(logoLink).toHaveAttribute('aria-label', 'Jovie');

    // Check if logo SVG is rendered
    const logo = page.getByTestId('site-logo');
    await expect(logo).toBeVisible();
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

    // Check that elements are still visible (with explicit timeouts for stability)
    await expect(page.locator('h1')).toContainText('Link in bio', {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByPlaceholder('Search artists...')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Check that carousel is still functional (use fallback selectors)
    const carousel = page.locator(
      '[data-testid="artist-carousel"], [role="region"][aria-label*="carousel"], .overflow-x-auto'
    );
    await expect(carousel.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('has proper accessibility features', async ({ page }) => {
    // Check for proper heading structure
    const headings = page.locator('h1, h2, h3');
    await expect(headings.first()).toContainText('Link in bio');

    // Check for proper button labels
    const claimButton = page.getByRole('button', { name: 'Select artist' });
    await expect(claimButton).toHaveAttribute('aria-disabled', 'true');

    // Check for proper image alt texts
    const images = page.locator('img');
    for (const img of await images.all()) {
      const alt = await img.getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });

  test('has proper loading states', async ({ page }) => {
    // Check that page loads without errors
    await expect(page.locator('body')).not.toContainText('Error');
    await expect(page.locator('body')).not.toContainText('Loading...');

    // Check that main content is visible
    await expect(page.locator('h1')).toBeVisible();
  });
});
