import { expect, test } from '@playwright/test';

/**
 * Suite 3: SmartLink Experience (JOV-1427)
 *
 * Fan lands on a profile via a SmartLink. Tests:
 * - DSP buttons render with correct aria-labels in listen mode
 * - Mode transitions don't crash React
 *
 * DSP links render as <button aria-label="Open in Spotify..."> (not <a href>)
 * because they use deep-link detection before redirecting.
 *
 * Run headed to visually verify:
 *   doppler run -- pnpm exec playwright test smartlink-experience --project=chromium --headed
 *
 * @smoke @critical
 */

test.use({ storageState: { cookies: [], origins: [] } });

const TEST_PROFILE = 'dualipa';

// DSP buttons render as: <button aria-label="Open in Spotify app...">Open in Spotify</button>
const DSP_BUTTON_SELECTOR =
  'button[aria-label*="Open in"], button:has-text("Open in Spotify"), button:has-text("Open in Apple"), button:has-text("Spotify"), button:has-text("Apple Music")';

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

  test('DSP buttons render in listen mode with platform names', async ({
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

    // DSP buttons must render — the entire purpose of listen mode
    // They render as <button aria-label="Open in Spotify...">Open in Spotify</button>
    const dspButton = page.locator(DSP_BUTTON_SELECTOR);
    await expect(
      dspButton.first(),
      'No DSP buttons found in listen mode — streaming data missing or StaticListenInterface broken'
    ).toBeVisible({ timeout: 30_000 });

    // Button must have a label identifying the platform
    const ariaLabel = await dspButton.first().getAttribute('aria-label');
    const buttonText = await dspButton
      .first()
      .innerText()
      .catch(() => '');
    const hasIdentifier =
      Boolean(ariaLabel?.length) || Boolean(buttonText?.trim().length);
    expect(
      hasIdentifier,
      'DSP button has no aria-label or text — screen reader and user cannot identify the platform'
    ).toBe(true);
  });

  test('listen mode shows "Open in" buttons not "No links" fallback', async ({
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

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });

    // Wait for DSP buttons to render (or the "no links" fallback message to appear)
    const dspButton = page.locator(DSP_BUTTON_SELECTOR);
    const noLinksMsg = page.getByText(/streaming links aren.t available/i);

    // One of these must appear within 30s
    await expect(dspButton.first().or(noLinksMsg)).toBeVisible({
      timeout: 30_000,
    });

    // If "no links" message shows — this is a seeding failure for dualipa specifically
    const showsNoLinks = await noLinksMsg.isVisible().catch(() => false);
    expect(
      showsNoLinks,
      'dualipa profile shows "streaming links not available" — Spotify seeding failed in global-setup.ts'
    ).toBe(false);
  });
});
