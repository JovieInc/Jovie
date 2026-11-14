import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe
  .skip('TipPromo', () => {
    test.describe('on the homepage', () => {
      test.beforeEach(async ({ page }) => {
        await page.route('**/api/profile/view', route =>
          route.fulfill({ status: 200, body: '{}' })
        );
        await page.route('**/api/audience/visit', route =>
          route.fulfill({ status: 200, body: '{}' })
        );
        await page.route('**/api/track', route =>
          route.fulfill({ status: 200, body: '{}' })
        );
        await page.goto('/', { timeout: SMOKE_TIMEOUTS.NAVIGATION });
        await waitForHydration(page);
      });

      test('displays the TipPromo section with correct content', async ({
        page,
      }) => {
        // Check that the TipPromo section is visible
        const tipSection = page
          .locator('section')
          .filter({ hasText: 'Pay, instantly' });
        await expect(tipSection).toBeVisible();

        // Check the main heading
        await expect(
          page.getByRole('heading', { name: 'Pay, instantly.' })
        ).toBeVisible();

        // Check the description text
        await expect(
          page.getByText('Fans tap once, you get paid')
        ).toBeVisible();
        await expect(page.getByText('No sign-ups, no fees')).toBeVisible();
        await expect(
          page.getByText('just pure support—directly in Venmo')
        ).toBeVisible();

        // Check the "See it live" button
        const ctaButton = page.getByRole('link', { name: 'See it live' });
        await expect(ctaButton).toBeVisible();
        await expect(ctaButton).toHaveAttribute('href', '/tim/pay');
      });

      test('has correct styling and appearance', async ({ page }) => {
        const tipSection = page
          .locator('section')
          .filter({ hasText: 'Pay, instantly' });

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
          .filter({ hasText: 'Pay, instantly' });
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

      test('is responsive on mobile devices', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        const tipSection = page
          .locator('section')
          .filter({ hasText: 'Pay, instantly' });
        await expect(tipSection).toBeVisible();

        // Check that text is still readable
        await expect(
          page.getByRole('heading', { name: 'Pay, instantly.' })
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: 'See it live' })
        ).toBeVisible();
      });
    });
  });
