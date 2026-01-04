import { expect, test } from '@playwright/test';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
} from './utils/smoke-test-utils';

/**
 * Basic profile smoke tests - simplified for reliability
 * These are lightweight tests that validate core profile functionality.
 */
test.describe('Basic Profile smoke tests @smoke', () => {
  test('taylorswift profile page loads with correct title @smoke', async ({
    page,
  }) => {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

    // Should not redirect to 404
    await expect(page).toHaveURL(/\/taylorswift/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Check that the page title includes artist name
    await expect(page).toHaveTitle(/Taylor Swift/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Check that we don't get a 404 error
    const notFoundText = page.locator('h1').filter({ hasText: /not found/i });
    await expect(notFoundText).not.toBeVisible({
      timeout: SMOKE_TIMEOUTS.QUICK,
    });
  });

  test('profile page responds correctly @smoke', async ({ page }) => {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    const response = await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

    // Should get 200 OK response
    expect(response?.status()).toBe(200);

    // Should have correct content type
    const contentType = response?.headers()['content-type'];
    expect(contentType).toContain('text/html');
  });

  test('non-existent profile returns 404 @smoke', async ({ page }) => {
    await smokeNavigate(page, '/nonexistentprofile123456');

    // Should show 404 content
    const notFoundHeading = page
      .locator('h1')
      .filter({ hasText: /not found/i });
    await expect(notFoundHeading).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('listen mode URL works @smoke', async ({ page }) => {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=listen`);

    // Should stay on listen mode URL
    await expect(page).toHaveURL(/\/taylorswift.*mode=listen/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Should not be 404
    const notFoundText = page.locator('h1').filter({ hasText: /not found/i });
    await expect(notFoundText).not.toBeVisible({
      timeout: SMOKE_TIMEOUTS.QUICK,
    });
  });

  test('tip mode URL works @smoke', async ({ page }) => {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=tip`);

    // Should stay on tip mode URL
    await expect(page).toHaveURL(/\/taylorswift.*mode=tip/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Should not be 404
    const notFoundText = page.locator('h1').filter({ hasText: /not found/i });
    await expect(notFoundText).not.toBeVisible({
      timeout: SMOKE_TIMEOUTS.QUICK,
    });
  });
});
