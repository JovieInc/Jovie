import { expect, test } from './setup';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * TipPromo Feature Flag Tests
 *
 * The "enabled" tests are marked as fixme because:
 * 1. Next.js replaces NEXT_PUBLIC_* variables at build time, not runtime
 * 2. Testing enabled state requires a separate test server with NEXT_PUBLIC_FEATURE_TIPS=true
 *
 * The "disabled" tests run against the actual environment to validate
 * the app's behavior with the real feature flag state.
 */
test.describe('TipPromo Feature Flag', () => {
  test.describe.fixme('when NEXT_PUBLIC_FEATURE_TIPS is enabled', () => {
    // These tests require a test server started with NEXT_PUBLIC_FEATURE_TIPS=true
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    test('displays the TipPromo section with correct content', async ({
      page,
    }) => {
      // Check that the TipPromo section is visible
      const tipSection = page
        .locator('section')
        .filter({ hasText: 'Tip, instantly' });
      await expect(tipSection).toBeVisible();

      // Check the main heading
      await expect(
        page.getByRole('heading', { name: 'Tip, instantly.' })
      ).toBeVisible();

      // Check the description text
      await expect(page.getByText('Fans tap once, you get paid')).toBeVisible();
      await expect(page.getByText('No sign-ups, no fees')).toBeVisible();
      await expect(
        page.getByText('just pure support—directly in Venmo')
      ).toBeVisible();

      // Check the "See it live" button
      const ctaButton = page.getByRole('link', { name: 'See it live' });
      await expect(ctaButton).toBeVisible();
      await expect(ctaButton).toHaveAttribute('href', '/tim/tip');
    });

    test('has correct styling and appearance', async ({ page }) => {
      const tipSection = page
        .locator('section')
        .filter({ hasText: 'Tip, instantly' });

      // Check section background color
      await expect(tipSection).toHaveClass(/bg-zinc-900/);
      await expect(tipSection).toHaveClass(/text-white/);
      await expect(tipSection).toHaveClass(/py-20/);

      // Check button styling
      const ctaButton = page.getByRole('link', { name: 'See it live' });
      await expect(ctaButton).toHaveClass(/bg-surface-2/);
      await expect(ctaButton).toHaveClass(/rounded/);
    });

    test('appears in the correct position on the page', async ({ page }) => {
      // Ensure the TipPromo appears before the footer
      const tipSection = page
        .locator('section')
        .filter({ hasText: 'Tip, instantly' });
      const preFooterCTA = page
        .locator('section')
        .filter({ hasText: 'Stop designing. Start converting.' });

      await expect(tipSection).toBeVisible();
      await expect(preFooterCTA).toBeVisible();

      // Get bounding boxes to verify positioning
      const tipBox = await tipSection.boundingBox();
      const ctaBox = await preFooterCTA.boundingBox();

      expect(tipBox).toBeTruthy();
      expect(ctaBox).toBeTruthy();

      // TipPromo should appear before PreFooterCTA (higher on page = lower Y coordinate)
      expect(tipBox!.y).toBeLessThan(ctaBox!.y);
    });

    test.describe('mobile responsive', () => {
      test.use({ viewport: { width: 375, height: 667 } });

      test('is responsive on mobile devices', async ({ page }) => {
        const tipSection = page
          .locator('section')
          .filter({ hasText: 'Tip, instantly' });
        await expect(tipSection).toBeVisible();

        // Check that text is still readable
        await expect(
          page.getByRole('heading', { name: 'Tip, instantly.' })
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: 'See it live' })
        ).toBeVisible();
      });
    });
  });

  test.describe('when NEXT_PUBLIC_FEATURE_TIPS is disabled', () => {
    // Tests run against the actual environment flag value
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    test('does not display the TipPromo section', async ({ page }) => {
      // Check that the TipPromo section is not present in the DOM
      const tipSection = page
        .locator('section')
        .filter({ hasText: 'Tip, instantly' });
      await expect(tipSection).toHaveCount(0);

      // Also check that the specific elements are not present
      await expect(page.getByText('Tip, instantly.')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'See it live' })).toHaveCount(
        0
      );
    });

    test('page loads normally without the TipPromo section', async ({
      page,
    }) => {
      // Ensure other sections are still visible
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page
          .locator('section')
          .filter({ hasText: 'Stop designing. Start converting.' })
      ).toBeVisible();

      // Check that page doesn't have JavaScript errors
      await expect(page.locator('body')).not.toContainText('Error');
    });
  });
});
