import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';

/**
 * Pricing Page Tests
 *
 * NOTE: These tests verify the public pricing page for unauthenticated
 * visitors. Must run without saved auth to see correct CTAs.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  isFastIteration,
  'Pricing coverage runs in the lighter content-gate fast lane'
);

test.describe('Pricing Page', () => {
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
    await page.goto('/pricing', { timeout: SMOKE_TIMEOUTS.NAVIGATION });
    await waitForHydration(page);
  });

  test('displays pricing plans correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Pricing|Jovie/);

    // Check main heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Check that pricing tiers are visible
    await expect(page.getByText('Free').first()).toBeVisible();
    await expect(page.getByText('$0').first()).toBeVisible();
  });

  test('has working call-to-action buttons', async ({ page }) => {
    const freeTierCta = page.getByRole('link', { name: 'Launch for Free' });
    await expect(freeTierCta).toBeVisible();
    await expect(freeTierCta).toHaveAttribute('href', /\/signup/);

    const foundingMemberCta = page.getByRole('link', {
      name: 'Choose Founding Member',
    });
    await expect(foundingMemberCta).toBeVisible();
    await expect(foundingMemberCta).toHaveAttribute('href', /\/signup/);
  });

  test('shows pricing tier details', async ({ page }) => {
    // Verify page has substantial content (pricing details)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 500).toBe(true);
  });
});
