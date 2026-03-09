import { expect, test } from '@playwright/test';

/**
 * Suite 3: SmartLink Experience (JOV-1427)
 *
 * Fan lands on a profile via a SmartLink. Tests:
 * - Page loads under 3s performance gate
 * - Streaming buttons render and are tappable
 * - Mode switching (default → listen → tip) works
 * - No JS errors on mode transitions
 *
 * Run headed to visually verify:
 *   doppler run -- pnpm exec playwright test smartlink-experience --project=chromium --headed
 *
 * @smoke @critical
 */

test.use({ storageState: { cookies: [], origins: [] } });

const TEST_PROFILE = 'dualipa';

function blockAnalytics(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/profile/view', r =>
      r.fulfill({ status: 200, body: '{}' })
    ),
    page.route('**/api/audience/visit', r =>
      r.fulfill({ status: 200, body: '{}' })
    ),
    page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' })),
  ]);
}

test.describe('SmartLink — Fan Experience', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('profile loads under 3s performance gate', async ({ page }) => {
    test.setTimeout(60_000);

    const start = Date.now();

    await page.goto(`/${TEST_PROFILE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Skip if profile not seeded
    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded — skipping perf gate');
      return;
    }

    // Artist name visible — this is the moment the fan sees real content
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    const ttfContent = Date.now() - start;

    // 3s performance gate — cached routes (after Turbopack warmup) must be fast
    // This catches regressions in SSR render time
    expect(
      ttfContent,
      `Profile took ${ttfContent}ms to show artist name — exceeds 3s gate`
    ).toBeLessThan(3_000);
  });

  test('streaming buttons render in listen mode', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto(`/${TEST_PROFILE}?mode=listen`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    // At least one DSP link must render — this is the SmartLink's core value prop
    const dspLink = page.locator(
      'a[href*="spotify"], a[href*="apple"], a[href*="tidal"], a[href*="youtube"]'
    );
    await expect(
      dspLink.first(),
      'No DSP streaming links rendered — SmartLink has no value for fans'
    ).toBeVisible({ timeout: 15_000 });

    // DSP links must be actual anchor tags with real href (not # or javascript:)
    const href = await dspLink.first().getAttribute('href');
    expect(href, 'DSP link has no href').toBeTruthy();
    expect(href, 'DSP link href is placeholder').not.toBe('#');
    expect(href, 'DSP link is a javascript: void').not.toMatch(/^javascript:/);
  });

  test('mode navigation: default → listen → tip does not crash', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(`/${TEST_PROFILE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    // Navigate through mode tabs if they exist
    const listenTab = page.locator(
      'a[href*="mode=listen"], button:has-text("Listen"), [data-testid="listen-tab"]'
    );
    const hasListenTab = await listenTab
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasListenTab) {
      await listenTab.first().click();
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    }

    const tipTab = page.locator(
      'a[href*="mode=tip"], button:has-text("Tip"), [data-testid="tip-tab"]'
    );
    const hasTipTab = await tipTab
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasTipTab) {
      await tipTab.first().click();
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    }

    // No React crashes from mode switching
    const reactErrors = consoleErrors.filter(e =>
      /minified react error|hydration failed|unhandled runtime|too many re-renders/i.test(
        e
      )
    );
    expect(
      reactErrors,
      `React errors after mode navigation: ${reactErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('DSP link opens correct streaming platform URL', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto(`/${TEST_PROFILE}?mode=listen`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    if (
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    // Find the Spotify link specifically (seeded in global-setup.ts)
    const spotifyLink = page.locator('a[href*="open.spotify.com"]');
    const hasSpotify = await spotifyLink
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (!hasSpotify) {
      // Might have a different DSP seeded — check for any DSP
      const anyDsp = page.locator(
        'a[href*="spotify"], a[href*="apple"], a[href*="tidal"]'
      );
      await expect(
        anyDsp.first(),
        'No streaming platform links found — DSP seeding or rendering is broken'
      ).toBeVisible({ timeout: 5_000 });
      return;
    }

    // Spotify link must be a real open.spotify.com/artist/ URL
    const href = await spotifyLink.first().getAttribute('href');
    expect(href, 'Spotify link is not an artist URL').toMatch(
      /^https:\/\/open\.spotify\.com\/artist\//
    );
  });
});
