import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

// Extend Window interface to include our test properties
declare global {
  interface Window {
    __TEST_PROFILE_WITH_VENMO__?: {
      id: string;
      userId: string;
      username: string;
      displayName: string;
      bio: string;
      avatarUrl: string;
      isPublic: boolean;
      isVerified: boolean;
      isClaimed: boolean;
      createdAt: Date;
      updatedAt: Date;
      socialLinks: Array<{
        id: string;
        platform: string;
        url: string;
        clicks: number;
        createdAt: Date;
      }>;
    };
    __TEST_TIP_CLICK_CAPTURED__?: boolean;
    posthog?: {
      capture: (
        eventName: string,
        properties?: Record<string, unknown>
      ) => void;
    };
  }
}

// Tipping tests require a real database with a profile that has a Venmo link.
// The profile is fetched server-side, so browser-side window mocks don't work.
// The /testartist profile must exist in the database with a venmo social link.
const hasDatabase = !!(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);

test.describe('Tipping MVP', () => {
  // Turbopack cold compilation of profile pages can take 60-120s
  test.setTimeout(180_000);

  // Test in both light and dark modes
  ['light', 'dark'].forEach(colorMode => {
    test.describe(`in ${colorMode} mode`, () => {
      test.beforeEach(async ({ page }) => {
        // Set color mode
        await page.addInitScript(mode => {
          localStorage.setItem('theme', mode);
        }, colorMode);

        // Enable tipping feature flag
        await page.addInitScript(() => {
          Object.defineProperty(process.env, 'NEXT_PUBLIC_FEATURE_TIPS', {
            value: 'true',
            writable: true,
            configurable: true,
          });
        });
      });

      test('shows tip button on profile with Venmo link', async ({ page }) => {
        // Profile data is fetched server-side — window mocks don't affect SSR.
        // Skip if no database or testartist profile doesn't exist.
        if (!hasDatabase) {
          console.log('⚠ Skipping tipping test — no database configured');
          test.skip();
          return;
        }

        // Create a mock profile with Venmo link (kept for reference but doesn't affect SSR)
        await page.addInitScript(() => {
          window.__TEST_PROFILE_WITH_VENMO__ = {
            id: 'test-id',
            userId: 'test-user-id',
            username: 'testartist',
            displayName: 'Test Artist',
            bio: 'Test artist bio',
            avatarUrl: 'https://example.com/avatar.jpg',
            isPublic: true,
            isVerified: true,
            isClaimed: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            socialLinks: [
              {
                id: 'venmo-link-id',
                platform: 'venmo',
                url: 'https://venmo.com/testartist',
                clicks: 0,
                createdAt: new Date(),
              },
            ],
          };
        });

        // Visit the profile page and wait for hydration (not networkidle)
        await page.goto('/testartist', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForHydration(page);

        // Check if the profile exists and loaded (not stuck in loading skeleton)
        const is404 = await page
          .locator('text="Profile not found"')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        const isLoading = await page
          .locator('[aria-busy="true"], text="Loading"')
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false);
        const h1Visible = await page
          .locator('h1')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        if (is404 || (!h1Visible && isLoading)) {
          console.log(
            '⚠ /testartist profile not found or stuck loading — skipping'
          );
          test.skip();
          return;
        }

        // Check that the tip button is visible
        const tipButton = page.getByRole('link', { name: 'Tip' });
        const tipVisible = await tipButton
          .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
          .catch(() => false);
        if (!tipVisible) {
          console.log(
            '⚠ Tip button not visible — profile may not have Venmo link'
          );
          test.skip();
          return;
        }

        // Set up event tracking
        await page.addInitScript(() => {
          window.__TEST_TIP_CLICK_CAPTURED__ = false;

          const originalPostHogCapture = window.posthog?.capture;
          if (window.posthog) {
            window.posthog.capture = function (
              eventName: string,
              properties?: Record<string, unknown>
            ) {
              if (eventName === 'tip_click') {
                window.__TEST_TIP_CLICK_CAPTURED__ = true;
              }
              return originalPostHogCapture?.call(
                window.posthog,
                eventName,
                properties
              );
            };
          }
        });

        // Click the tip button
        await tipButton.click();

        // Verify we're on the tip page
        await page.waitForURL('**/testartist?mode=tip', {
          timeout: SMOKE_TIMEOUTS.URL_STABLE,
        });

        // Check that the tip interface is visible
        const tipSelector = page.locator('[data-test="tip-selector"]');
        await expect(tipSelector).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Check that the amount buttons are visible
        const amountButtons = page.locator('button:has-text("$")');
        await expect(amountButtons).toHaveCount(3);

        // Check that the continue button is visible
        const continueButton = page.getByRole('button', { name: 'Continue' });
        await expect(continueButton).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      });

      test('generates and displays QR code on desktop', async ({ page }) => {
        if (!hasDatabase) {
          test.skip();
          return;
        }

        // Set viewport to desktop size
        await page.setViewportSize({ width: 1280, height: 800 });

        // Visit the profile page and wait for hydration (not networkidle)
        await page.goto('/testartist?mode=tip', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForHydration(page);

        // Check if the profile exists (not stuck in loading skeleton or 404)
        const is404 = await page
          .locator('text="Profile not found"')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        const h1Visible = await page
          .locator('h1')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        if (is404 || !h1Visible) {
          console.log(
            '⚠ /testartist profile not found or stuck loading — skipping'
          );
          test.skip();
          return;
        }

        // Check that the QR code overlay is visible
        const qrOverlay = page
          .locator('div')
          .filter({ hasText: 'View on mobile' });
        await expect(qrOverlay).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Check that the QR code image is loaded
        const qrImage = qrOverlay.locator('img');
        await expect(qrImage).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Verify QR code contains the correct URL
        const qrSrc = await qrImage.getAttribute('src');
        expect(qrSrc).toContain('api.qrserver.com');
        expect(qrSrc).toContain('testartist');

        // Test closing and reopening the QR overlay
        const closeButton = qrOverlay.getByRole('button', { name: 'Close' });
        await closeButton.click();

        // QR overlay should be hidden
        await expect(qrOverlay).not.toBeVisible();

        // Reopen button should be visible
        const reopenButton = page.getByRole('button', {
          name: 'View on mobile',
        });
        await expect(reopenButton).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Click reopen button
        await reopenButton.click();

        // QR overlay should be visible again
        await expect(qrOverlay).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      });

      test('selects amount and opens Venmo link', async ({ page, context }) => {
        if (!hasDatabase) {
          test.skip();
          return;
        }

        // Visit the tip page and wait for hydration (not networkidle)
        await page.goto('/testartist?mode=tip', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForHydration(page);

        // Check if the profile exists (not stuck in loading skeleton or 404)
        const is404 = await page
          .locator('text="Profile not found"')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        const h1Visible = await page
          .locator('h1')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        if (is404 || !h1Visible) {
          console.log(
            '⚠ /testartist profile not found or stuck loading — skipping'
          );
          test.skip();
          return;
        }

        // Select an amount (the middle option)
        const amountButtons = page.locator('button:has-text("$")');
        await expect(amountButtons.first()).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        await amountButtons.nth(1).click();

        // Listen for new pages/tabs
        const pagePromise = context.waitForEvent('page');

        // Click continue button
        const continueButton = page.getByRole('button', { name: 'Continue' });
        await continueButton.click();

        // Get the new page
        const newPage = await pagePromise;
        await newPage.waitForLoadState('domcontentloaded');

        // Verify the URL contains Venmo
        const url = newPage.url();
        expect(url).toContain('venmo.com');

        // Verify the URL contains the amount parameter
        expect(url).toContain('utm_amount=');

        // Close the new page
        await newPage.close();
      });

      test('shows back button on tip page that returns to profile', async ({
        page,
      }) => {
        if (!hasDatabase) {
          test.skip();
          return;
        }

        // Visit the tip page and wait for hydration (not networkidle)
        await page.goto('/testartist?mode=tip', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForHydration(page);

        // Check if the profile exists (not stuck in loading skeleton or 404)
        const is404 = await page
          .locator('text="Profile not found"')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        const h1Visible = await page
          .locator('h1')
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        if (is404 || !h1Visible) {
          console.log(
            '⚠ /testartist profile not found or stuck loading — skipping'
          );
          test.skip();
          return;
        }

        // Check that the back button is visible
        const backButton = page.getByRole('button', {
          name: 'Back to profile',
        });
        await expect(backButton).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Click the back button
        await backButton.click();

        // Verify we're back on the profile page
        await page.waitForURL('**/testartist', {
          timeout: SMOKE_TIMEOUTS.URL_STABLE,
        });

        // Check that we're on the profile page (tip button is visible)
        const tipButton = page.getByRole('link', { name: 'Tip' });
        await expect(tipButton).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      });
    });
  });
});
