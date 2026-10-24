import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * /download access (JOV-7864 follow-up). The Mac download is the desktop
 * app, actions keep visible names, and the iPhone status is text — never a
 * disabled control that looks available.
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

  test('states the iPhone app as text, not a disabled control', async ({
    page,
  }) => {
    // The (marketing) layout renders the sitewide email signup, whose sr-only
    // success live region is also role='status'. Scope to the iPhone section.
    await expect(page.locator('#iphone').getByRole('status')).toHaveText(
      'Not a public download'
    );
    await expect(page.locator('button[disabled]')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'See iPhone status' })
    ).toHaveAttribute('href', '#iphone');
  });
});
