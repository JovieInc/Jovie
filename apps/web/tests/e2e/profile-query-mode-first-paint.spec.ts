import { expect, test } from './setup';
import { TEST_PROFILES, waitForHydration } from './utils/smoke-test-utils';

const MODE_CASES = [
  { requestedMode: 'listen', surfaceMode: 'listen' },
  { requestedMode: 'subscribe', surfaceMode: 'subscribe' },
  { requestedMode: 'tour', surfaceMode: 'tour' },
  { requestedMode: 'about', surfaceMode: 'about' },
  { requestedMode: 'releases', surfaceMode: 'listen' },
] as const;

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

test.describe('public profile query-mode first paint', () => {
  test.setTimeout(180_000);

  for (const { requestedMode, surfaceMode } of MODE_CASES) {
    test(`server-renders ${requestedMode} without the Home card`, async ({
      browser,
    }, testInfo) => {
      const baseURL = testInfo.project.use.baseURL;
      expect(typeof baseURL).toBe('string');

      const context = await browser.newContext({
        baseURL: baseURL as string,
        javaScriptEnabled: false,
        storageState: { cookies: [], origins: [] },
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();

      try {
        const response = await page.goto(
          `/${TEST_PROFILES.DUALIPA}?mode=${requestedMode}`,
          { waitUntil: 'domcontentloaded' }
        );

        expect(response?.status()).toBe(200);
        await expect(
          page.locator('[data-profile-mode]').first()
        ).toHaveAttribute('data-profile-mode', requestedMode);
        await expect(
          page.locator('[data-testid="profile-compact-surface"]')
        ).toHaveAttribute('data-mode', surfaceMode);
        await expect(page.getByTestId('profile-home-rail')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }

  test('hydrates Music without changing the server-rendered surface', async ({
    page,
  }) => {
    await page.goto(`/${TEST_PROFILES.DUALIPA}?mode=listen`, {
      waitUntil: 'domcontentloaded',
    });

    const surface = page.getByTestId('profile-compact-surface');
    await expect(surface).toHaveAttribute('data-mode', 'listen');
    await expect(page.getByTestId('profile-home-rail')).toHaveCount(0);

    await waitForHydration(page);
    await expect(surface).toHaveAttribute('data-mode', 'listen');
    await expect(page.getByTestId('profile-home-rail')).toHaveCount(0);
  });

  test('keeps unknown query modes on the canonical Home surface', async ({
    page,
  }) => {
    await page.goto(`/${TEST_PROFILES.DUALIPA}?mode=music`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByTestId('profile-compact-surface')).toHaveAttribute(
      'data-mode',
      'profile'
    );
    await expect(page.getByTestId('profile-home-rail')).toHaveCount(1);
  });
});
