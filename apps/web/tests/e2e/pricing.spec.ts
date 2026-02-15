import { expect, test } from './setup';

/**
 * Pricing Page Tests
 *
 * NOTE: These tests verify the public pricing page for unauthenticated
 * visitors. Must run without saved auth to see correct CTAs.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Pricing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pricing', { timeout: 60000 });
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
    // All tiers use "Get started" CTA buttons linking to /waitlist
    const getStartedButtons = page.getByRole('link', { name: /Get started/i });
    const count = await getStartedButtons.count();
    expect(count).toBeGreaterThan(0);

    // At least one should link to waitlist
    const firstButton = getStartedButtons.first();
    await expect(firstButton).toBeVisible();
    const href = await firstButton.getAttribute('href');
    expect(href).toContain('/signup');
  });

  test('shows pricing tier details', async ({ page }) => {
    // Verify page has substantial content (pricing details)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 500).toBe(true);
  });
});
