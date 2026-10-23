import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Heading outline and footer naming (JOV-8564 / JOV-8565). Footer column
 * titles name their sections through `aria-labelledby` instead of joining
 * the heading outline, and public marketing routes keep a single H1.
 */
test.describe('marketing heading outline', () => {
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
  });

  test('names footer columns without adding them to the heading outline', async ({
    page,
  }) => {
    await page.goto('/pricing', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    const footer = page.getByTestId('marketing-footer');
    await expect(footer).toHaveCount(1);
    await expect(footer).toHaveAttribute('data-footer-variant', 'expanded');
    await expect(footer.getByRole('heading')).toHaveCount(0);

    const sections = footer.locator('nav section[aria-labelledby]');
    const count = await sections.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const labelledBy = await sections
        .nth(index)
        .getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const title = footer.locator(`p#${labelledBy}`);
      await expect(title).toBeVisible();
      await expect(title).toHaveClass(/mf-eyebrow/);
    }
  });

  for (const path of ['/artist-notifications', '/pricing']) {
    test(`${path} keeps a single H1`, async ({ page }) => {
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await waitForHydration(page);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }
});
