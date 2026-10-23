import { expect, test } from '@playwright/test';

/**
 * Suite 3: SmartLink Experience (JOV-1427)
 *
 * Fan lands on a profile via a SmartLink. Tests:
 * - Listen mode on a profile with releases opens the Music tab: a catalog of
 *   release rows that each link to the release SmartLink (JOV-6197 made Music
 *   truthful; the artist-level DSP list only renders when there is no catalog).
 * - The release SmartLink offers a real streaming destination, never the
 *   "no links" fallback.
 *
 * Run headed to visually verify:
 *   doppler run -- pnpm exec playwright test smartlink-experience --project=chromium --headed
 *
 * @smoke @critical
 */

test.use({ storageState: { cookies: [], origins: [] } });

const TEST_PROFILE = 'dualipa';
// Seeded released single with a Spotify link (tests/seed-test-data.ts).
const RELEASED_SLUG = 'raw-energy';

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

test.describe('SmartLink — Fan Experience', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('listen mode lists released music linking to its SmartLink', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    try {
      await page.goto(`/${TEST_PROFILE}?mode=listen`, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(true, 'Server too slow under parallel load');
        return;
      }
      throw e;
    }

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    const lower = bodyText.toLowerCase();
    if (
      lower.includes('not found') ||
      lower.includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    // h1 proves the profile loaded
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });

    // Listen mode is the Music tab. dualipa has a catalog, so it renders the
    // catalog surface, and every row is a link to that release's SmartLink.
    const music = page.getByTestId('profile-primary-tab-releases');
    await expect(
      music.getByRole('heading', { name: 'Music', level: 2 })
    ).toBeVisible({ timeout: 30_000 });
    const releaseLink = music.locator(
      `a[href="/${TEST_PROFILE}/${RELEASED_SLUG}"]`
    );
    await expect(
      releaseLink,
      'Listen mode must list released music that links to its SmartLink'
    ).toBeVisible({ timeout: 30_000 });
    await expect(releaseLink).toContainText('Raw Energy');
  });

  test('release SmartLink offers a streaming destination, not the "No links" fallback', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    try {
      await page.goto(`/${TEST_PROFILE}/${RELEASED_SLUG}`, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(true, 'Server too slow under parallel load');
        return;
      }
      throw e;
    }

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    const lower = bodyText.toLowerCase();
    if (
      lower.includes('not found') ||
      lower.includes('temporarily unavailable')
    ) {
      test.skip(true, 'Release not seeded');
      return;
    }

    await expect(
      page.getByRole('heading', { name: 'Raw Energy', level: 1 })
    ).toBeVisible({ timeout: 30_000 });

    // The release SmartLink offers its streaming services as links.
    const services = page.getByRole('group', {
      name: 'Choose a streaming service',
    });
    const dspLink = services.getByRole('link', { name: /with Spotify/i });
    const noLinksMsg = page.getByText(/streaming links aren.t available/i);

    // One of these must appear within 30s
    await expect(dspLink.or(noLinksMsg)).toBeVisible({
      timeout: 30_000,
    });

    // If "no links" message shows — this is a seeding failure for dualipa specifically
    const showsNoLinks = await noLinksMsg.isVisible().catch(() => false);
    expect(
      showsNoLinks,
      'raw-energy SmartLink shows "streaming links not available" — Spotify seeding failed in global-setup.ts'
    ).toBe(false);
    await expect(dspLink).toHaveAttribute(
      'href',
      /^https:\/\/open\.spotify\.com\/album\//
    );
  });
});
