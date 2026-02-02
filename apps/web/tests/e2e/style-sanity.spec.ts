import { expect, test } from '@playwright/test';

/**
 * Style Sanity Tests
 *
 * Simple sanity check that Tailwind classes resolve to expected computed styles in the browser.
 * We do not rely on specific pages to include elements; instead we inject a transient node.
 *
 * NOTE: Tests run on public pages. Must run without saved authentication.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Style sanity', () => {
  test('bg-black text-white computes correctly', async ({ page }) => {
    // Use a lightweight route that exists publicly
    await page.goto('/sandbox');

    // Inject a transient element with tailwind classes and measure computed styles
    const result = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'bg-black text-white';
      el.textContent = 'style-sanity';
      el.style.position = 'fixed';
      el.style.left = '-9999px'; // offscreen
      document.body.appendChild(el);

      const styles = window.getComputedStyle(el);
      const bg = styles.backgroundColor;
      const color = styles.color;

      el.remove();
      return { bg, color };
    });

    // Chromium returns rgb values, ensure black/white within tolerance
    // bg-black -> rgb(0, 0, 0), text-white -> rgb(255, 255, 255)
    expect(result.bg).toBe('rgb(0, 0, 0)');
    expect(result.color).toBe('rgb(255, 255, 255)');
  });
});
