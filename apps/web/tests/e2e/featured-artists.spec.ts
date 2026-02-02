import { expect, test } from '@playwright/test';

/**
 * Featured Creators Tests
 *
 * NOTE: Tests public homepage for unauthenticated visitors.
 * Must run without saved authentication.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Featured Creators on Homepage', () => {
  test('featured creators section loads and displays creators', async ({
    page,
  }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Should load homepage successfully
    await expect(page).toHaveURL('/');

    // Wait for featured creators section to load
    await page.waitForSelector(
      'h2:has-text("Featured Creators"), [data-testid="featured-creators"]',
      {
        timeout: 10000,
      }
    );

    // Check for featured creators heading
    const featuredHeading = page.locator('h2').filter({
      hasText: /featured.*creators/i,
    });
    await expect(featuredHeading.first()).toBeVisible();

    // Check that creator cards/links are present
    const creatorElements = page.locator(
      'a[href^="/"], .creator-card, [data-testid="creator-card"]'
    );
    const creatorCount = await creatorElements.count();

    // Should have at least 3 featured creators
    expect(creatorCount).toBeGreaterThanOrEqual(3);

    // Check that creator names/handles are visible
    const creatorNames = page.locator(
      'text=/^[a-zA-Z]+ [a-zA-Z]+$|@[a-zA-Z]+|[a-zA-Z]+$/'
    );
    const visibleNames = await creatorNames.filter({ hasText: /.+/ }).count();
    expect(visibleNames).toBeGreaterThan(0);
  });

  test('featured creators are clickable and lead to profile pages', async ({
    page,
  }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait for featured creators to load
    await page.waitForSelector('h2:has-text("Featured Creators")', {
      timeout: 10000,
    });

    // Find first clickable creator link
    const creatorLink = page
      .locator('a[href^="/"]')
      .filter({
        hasText: /[a-zA-Z]/,
      })
      .first();

    // Should have at least one creator link
    await expect(creatorLink).toBeVisible();

    // Get the href to verify it's a valid profile link
    const href = await creatorLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/[a-zA-Z0-9_-]+$/);

    // Click the creator link
    await creatorLink.click();

    // Should navigate to creator profile page
    await expect(page).toHaveURL(href!);

    // Should show creator profile content
    const profileContent = page.locator(
      'h1, h2, .creator-name, [data-testid="creator-name"]'
    );
    await expect(profileContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('featured creators load without console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for featured creators to load
    await page.waitForTimeout(3000);

    // Check for critical errors (ignore harmless ones)
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Failed to load resource') && // Image 404s
        !error.includes('net::ERR_FAILED') && // Network errors
        !error.includes('i.scdn.co') && // Spotify image errors
        !error.includes('CORS') // External service CORS
    );

    if (criticalErrors.length > 0) {
      console.log('Critical errors found:', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });

  test('featured creators display images correctly', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait for featured creators section
    await page.waitForSelector('h2:has-text("Featured Creators")', {
      timeout: 10000,
    });

    // Find creator images
    const creatorImages = page.locator(
      'img[alt*="creator"], img[alt*="profile"], img[src*="avatar"]'
    );
    const imageCount = await creatorImages.count();

    if (imageCount > 0) {
      // Check that at least one image loads successfully
      const firstImage = creatorImages.first();
      await expect(firstImage).toBeVisible();

      // Check that image has proper attributes
      const src = await firstImage.getAttribute('src');
      const alt = await firstImage.getAttribute('alt');

      expect(src).toBeTruthy();
      expect(alt).toBeTruthy();
    }
  });

  test('featured creators section is responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Featured creators should still be visible on mobile
    const featuredSection = page.locator('h2').filter({
      hasText: /featured.*creators/i,
    });
    await expect(featuredSection.first()).toBeVisible();

    // Artist elements should be accessible on mobile
    const creatorElements = page.locator('a[href^="/"]');
    const mobileArtistCount = await creatorElements.count();
    expect(mobileArtistCount).toBeGreaterThan(0);

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Should still show featured creators
    await expect(featuredSection.first()).toBeVisible();

    const tabletArtistCount = await creatorElements.count();
    expect(tabletArtistCount).toBeGreaterThan(0);
  });
});
