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
    await expect(page.locator('h1')).toHaveText('Pricing');
    await expect(
      page.getByRole('heading', { name: 'Artist profiles built to convert' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Capture fans once. Bring them back automatically.',
      })
    ).toBeVisible();

    // Check that pricing tiers are visible
    await expect(page.getByTestId('marketing-pricing-plan-free')).toContainText(
      'Free'
    );
    await expect(page.getByTestId('marketing-pricing-plan-free')).toContainText(
      '$0'
    );
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toContainText(
      'Pro'
    );
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toContainText(
      'Waitlist'
    );
    await expect(
      page.getByTestId('marketing-pricing-plan-enterprise')
    ).toHaveCount(0);
    await expect(page.getByTestId('marketing-pricing-plan-team')).toHaveCount(
      0
    );
  });

  test('has working call-to-action buttons', async ({ page }) => {
    const freeTierCta = page
      .getByRole('link', { name: 'Claim your profile' })
      .first();
    await expect(freeTierCta).toBeVisible();
    await expect(freeTierCta).toHaveAttribute('href', /\/signup\?plan=free/);
    await expect(
      page.getByTestId('marketing-pricing-plan-pro').getByRole('link', {
        name: 'Request Access',
      })
    ).toHaveAttribute('href', '/signup?plan=pro');
    const requestAccessButtonsOnGrid = await page
      .locator('.marketing-pricing-plan-card')
      .evaluateAll(cards =>
        cards.map(card => {
          const cta = card.querySelector<HTMLElement>(
            '.marketing-pricing-plan-card__cta'
          );
          const cardRect = card.getBoundingClientRect();
          const ctaRect = cta?.getBoundingClientRect();
          if (!ctaRect) return false;
          return (
            Math.abs(
              cardRect.left +
                cardRect.width / 2 -
                (ctaRect.left + ctaRect.width / 2)
            ) <= 1 && ctaRect.right <= cardRect.right
          );
        })
      );
    expect(requestAccessButtonsOnGrid).toEqual([true, true]);
    await expect(
      page.getByRole('link', { name: 'Explore Artist Profiles' }).first()
    ).toBeVisible();

    await expect(page.getByText('Compare all features').first()).toBeVisible();
  });

  test('shows pricing tier details', async ({ page }) => {
    // Verify page has substantial content (pricing details)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 500).toBe(true);
  });
});
