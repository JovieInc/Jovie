import { expect, test } from '@playwright/test';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('CTAButton Component', () => {
  test('should render correctly and handle state changes', async ({ page }) => {
    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--state-transitions'
    );

    // Wait for the component to be visible
    await page.waitForSelector('a[data-state="idle"]');

    // Check that all states are rendered correctly
    const idleButtons = await page.$$('a[data-state="idle"]');
    expect(idleButtons.length).toBeGreaterThan(0);

    const loadingButtons = await page.$$('button[data-state="loading"]');
    expect(loadingButtons.length).toBeGreaterThan(0);

    const successButtons = await page.$$('button[data-state="success"]');
    expect(successButtons.length).toBeGreaterThan(0);

    // Check for spinner in loading state
    const spinnerElements = await page.$$('[data-testid="spinner"]');
    expect(spinnerElements.length).toBeGreaterThan(0);

    // Check for check icon in success state
    const checkIcons = await page.$$('svg[aria-hidden="true"]');
    expect(checkIcons.length).toBeGreaterThan(0);
  });

  test('should maintain consistent dimensions across state changes', async ({
    page,
  }) => {
    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--state-transitions'
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
    await page.goto('/storybook/iframe.html?id=ui-ctabutton--all-variants');

    // Focus the first button using keyboard navigation
    await page.keyboard.press('Tab');

    // Check if the button is focused
    const focusedElement = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase()
    );
    expect(focusedElement).toBe('a');

    // Navigate to the next button
    await page.keyboard.press('Tab');
    const secondFocusedElement = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase()
    );
    expect(secondFocusedElement).toBe('a');

    // Navigate to the third button
    await page.keyboard.press('Tab');
    const thirdFocusedElement = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase()
    );
    expect(thirdFocusedElement).toBe('a');
  });

  test('should handle reduced motion preference', async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Navigate to the Storybook page for CTAButton
    await page.goto(
      '/storybook/iframe.html?id=ui-ctabutton--state-transitions'
    );

    const button = await page.$('[data-reduced-motion="true"]');
    expect(button).not.toBeNull();
  });

  test('should handle theme changes correctly', async ({ page }) => {
    // Navigate to the Storybook page for CTAButton
    await page.goto('/storybook/iframe.html?id=ui-ctabutton--theme-comparison');

    // Check light theme button
    const lightThemeSection = await page.$('.bg-white');
    const lightThemeButton = await lightThemeSection?.$('a');
    expect(await lightThemeButton?.getAttribute('class')).toContain(
      'bg-btn-primary'
    );

    // Check dark theme button
    const darkThemeSection = await page.$('.bg-gray-900');
    const darkThemeButton = await darkThemeSection?.$('a');
    expect(await darkThemeButton?.getAttribute('class')).toContain(
      'bg-btn-primary'
    );
  });
});
