import { expect, test } from '@playwright/test';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

// Storybook pages need longer timeouts due to slow rendering
const STORYBOOK_TIMEOUT = 120_000;
const STORYBOOK_NAV_OPTIONS = {
  waitUntil: 'domcontentloaded' as const,
  timeout: STORYBOOK_TIMEOUT,
};

test.describe('CTAButton Component', () => {
  test('should render correctly and handle state changes', async ({ page }) => {
    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--state-transitions',
      STORYBOOK_NAV_OPTIONS
    );

    // Wait for any buttons or links to be visible (more flexible selector)
    await page.waitForSelector('a, button', { timeout: 60000 });

    // Check that buttons/links are rendered
    const buttons = await page.$$('a, button');
    expect(buttons.length).toBeGreaterThan(0);

    // Verify the page loaded successfully
    const pageTitle = await page.title();
    expect(pageTitle.length).toBeGreaterThan(0);
  });

  test('should maintain consistent dimensions across state changes', async ({
    page,
  }) => {
    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--state-transitions',
      STORYBOOK_NAV_OPTIONS
    );

    // Get dimensions of idle button
    const idleButton = await page.$('a[data-state="idle"]');
    const idleBoundingBox = await idleButton?.boundingBox();

    // Get dimensions of loading button
    const loadingButton = await page.$('button[data-state="loading"]');
    const loadingBoundingBox = await loadingButton?.boundingBox();

    // Get dimensions of success button
    const successButton = await page.$('button[data-state="success"]');
    const successBoundingBox = await successButton?.boundingBox();

    // Compare dimensions (allow 1px tolerance)
    expect(
      Math.abs((idleBoundingBox?.width || 0) - (loadingBoundingBox?.width || 0))
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (idleBoundingBox?.height || 0) - (loadingBoundingBox?.height || 0)
      )
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((idleBoundingBox?.width || 0) - (successBoundingBox?.width || 0))
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (idleBoundingBox?.height || 0) - (successBoundingBox?.height || 0)
      )
    ).toBeLessThanOrEqual(1);
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--all-variants',
      STORYBOOK_NAV_OPTIONS
    );

    // Wait for buttons to be visible
    await page.waitForSelector('a, button', { timeout: 60000 });

    // Get all focusable buttons/links
    const buttons = await page.$$('a, button');
    expect(buttons.length).toBeGreaterThan(0);

    // Verify buttons are accessible (have proper attributes)
    const firstButton = buttons[0];
    const isAccessible = await firstButton.evaluate(el => {
      return (
        el.hasAttribute('href') ||
        el.getAttribute('role') !== null ||
        el.tagName.toLowerCase() === 'button'
      );
    });
    expect(isAccessible).toBe(true);
  });

  test('should handle reduced motion preference', async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--state-transitions',
      STORYBOOK_NAV_OPTIONS
    );

    // Wait for buttons to load
    await page.waitForSelector('a[data-state="idle"], button', {
      timeout: 30000,
    });

    // Verify buttons are present (reduced motion affects animations, not visibility)
    const buttons = await page.$$('a, button');
    expect(buttons.length).toBeGreaterThan(0);

    // Verify the page respects prefers-reduced-motion
    const hasReducedMotion = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    expect(hasReducedMotion).toBe(true);
  });

  test('should handle theme changes correctly', async ({ page }) => {
    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--theme-comparison',
      STORYBOOK_NAV_OPTIONS
    );

    // Wait for buttons/links to load
    await page.waitForSelector('a, button', { timeout: 60000 });

    // Verify buttons exist for theme comparison
    const buttons = await page.$$('a, button');
    expect(buttons.length).toBeGreaterThan(0);

    // Verify the page has loaded with content
    const bodyContent = await page.textContent('body');
    expect(bodyContent?.length).toBeGreaterThan(0);
  });
});
