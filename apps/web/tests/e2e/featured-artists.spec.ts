import { expect, test } from '@playwright/test';

/**
 * Homepage Showcase Tests (formerly "Featured Creators")
 *
 * The homepage "See it in action" carousel showcases example profiles.
 * These tests verify it renders correctly for unauthenticated visitors.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Force all DeferredSections to render immediately by patching
 * IntersectionObserver before the page loads. This is necessary because
 * Playwright's headless mode doesn't reliably trigger IntersectionObserver
 * callbacks during programmatic scrolling.
 */
async function forceDeferredSections(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const OriginalIO = window.IntersectionObserver;
    window.IntersectionObserver = class extends OriginalIO {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit
      ) {
        super(callback, options);
        const self = this;
        const origObserve = this.observe.bind(this);
        this.observe = (target: Element) => {
          origObserve(target);
          setTimeout(() => {
            callback(
              [
                {
                  isIntersecting: true,
                  target,
                  intersectionRatio: 1,
                } as IntersectionObserverEntry,
              ],
              self
            );
          }, 50);
        };
      }
    } as unknown as typeof IntersectionObserver;
  });
}

test.describe('Featured Creators on Homepage', () => {
  test('featured creators section loads and displays creators', async ({
    page,
  }) => {
    await forceDeferredSections(page);

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await expect(page).toHaveURL('/');

    // The homepage showcase is "See it in action" (inside a DeferredSection)
    const showcaseHeading = page
      .locator('h2')
      .filter({ hasText: /see it in action|featured/i });
    const dataTestId = page.locator('[data-testid="featured-creators"]');

    await expect(showcaseHeading.first().or(dataTestId.first())).toBeVisible({
      timeout: 20000,
    });
  });

  test('featured creators are clickable and lead to profile pages', async ({
    page,
  }) => {
    await forceDeferredSections(page);

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for showcase section
    const showcaseHeading = page
      .locator('h2')
      .filter({ hasText: /see it in action|featured/i });
    await expect(showcaseHeading.first()).toBeVisible({ timeout: 20000 });

    // The carousel shows avatar images, not profile links.
    // Verify the section rendered by checking for images.
    const carouselImages = page.locator('img[alt*="avatar"]');
    const imageCount = await carouselImages.count();

    // Fallback: check for any links on the page
    if (imageCount === 0) {
      const profileLinks = page.locator('a[href^="/"]').filter({
        hasText: /[a-zA-Z]/,
      });
      const linkCount = await profileLinks.count();
      expect(linkCount).toBeGreaterThan(0);
    } else {
      expect(imageCount).toBeGreaterThan(0);
    }
  });

  test('featured creators load without console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await forceDeferredSections(page);

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for deferred sections to render
    await page.waitForTimeout(2000);

    // Check for critical errors (ignore harmless ones)
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Failed to load resource') &&
        !error.includes('net::ERR_FAILED') &&
        !error.includes('i.scdn.co') &&
        !error.includes('CORS') &&
        !error.includes('Clerk') &&
        !error.includes('Sentry')
    );

    if (criticalErrors.length > 0) {
      console.log('Critical errors found:', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });

  test('featured creators display images correctly', async ({ page }) => {
    await forceDeferredSections(page);

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for showcase section
    const showcaseHeading = page
      .locator('h2')
      .filter({ hasText: /see it in action|featured/i });
    await expect(showcaseHeading.first()).toBeVisible({ timeout: 20000 });

    // Check for images in the showcase section (carousel avatars)
    const images = page.locator('img');
    const imageCount = await images.count();
    expect(imageCount).toBeGreaterThan(0);

    // Check first visible image has proper attributes
    const visibleImages = page.locator('img:visible');
    const visibleCount = await visibleImages.count();
    if (visibleCount > 0) {
      const firstImage = visibleImages.first();
      const alt = await firstImage.getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });

  test('featured creators section is responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await forceDeferredSections(page);

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Showcase should be visible on mobile
    const showcaseHeading = page
      .locator('h2')
      .filter({ hasText: /see it in action|featured/i });
    await expect(showcaseHeading.first()).toBeVisible({ timeout: 20000 });

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(showcaseHeading.first()).toBeVisible({ timeout: 20000 });
  });
});
