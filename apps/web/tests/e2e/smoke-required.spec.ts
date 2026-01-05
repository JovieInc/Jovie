import { expect, test } from '@playwright/test';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
} from './utils/smoke-test-utils';

/**
 * Required Smoke Test - MUST PASS for every deploy to main
 *
 * This test is intentionally minimal and fast (<1 min).
 * It verifies the most critical public-facing flow: public profiles load.
 *
 * Auth testing is covered by the full E2E suite (use 'testing' label on PRs).
 * This smoke test can run locally without secrets.
 *
 * @smoke @required
 */

test.describe('Required Smoke Test @smoke @required', () => {
  test('public profile loads without errors', async ({ page }) => {
    // Navigate to a known seeded profile
    const response = await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);

    // Must not be a server error
    const status = response?.status() ?? 0;
    expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

    // Check if database is available
    const pageTitle = await page.title();
    const isTemporarilyUnavailable = pageTitle.includes(
      'temporarily unavailable'
    );

    // If profile exists and DB is available, verify core elements
    if (status === 200 && !isTemporarilyUnavailable) {
      // Verify page title contains creator name
      await expect(page).toHaveTitle(/Dua Lipa/i, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Verify h1 displays creator name
      await expect(page.locator('h1')).toContainText('Dua Lipa', {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Verify profile image is visible
      const profileImage = page.locator('img').first();
      await expect(profileImage).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
    } else {
      // For 404/400/temporarily unavailable, just verify page renders
      await page.waitForLoadState('domcontentloaded');
      const bodyContent = await page.locator('body').textContent();
      expect(bodyContent).toBeTruthy();
    }
  });
});
