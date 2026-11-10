import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * /download access (JOV-7864 follow-up). The Mac download is the desktop
 * app, actions keep visible names, and the page offers only what can be
 * downloaded: no iPhone dead end and no disabled control that looks available.
 */
test.describe('download page access', () => {
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
    await page.goto('/download', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);
  });

  test('keeps one H1 with named download actions', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText(
      'Jovie, Installed Where You Work.'
    );

    const downloadActions = page.getByRole('link', {
      name: 'Download for Mac',
    });
    expect(await downloadActions.count()).toBeGreaterThanOrEqual(2);
    await expect(downloadActions.first()).toBeVisible();

    const releases = page.getByRole('link', { name: 'View releases' });
    await expect(releases).toHaveCount(1);
  });

  test('offers only what can be downloaded', async ({ page }) => {
    await expect(page.locator('#iphone')).toHaveCount(0);
    await expect(page.getByText('Not a public download')).toHaveCount(0);
    await expect(page.locator('button[disabled]')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'See iPhone status' })
    ).toHaveCount(0);
  });
});
