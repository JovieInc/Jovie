import { expect, test } from './setup';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * From md up the public profile renders its compact surface as a fixed-height
 * phone card. Its content region must stay inside that card and scroll, or
 * rows run under the tab bar and can never be reached (jov.ie/tim dogfood
 * 2026-09-27).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PHONE_COLUMN_VIEWPORTS = [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

for (const viewport of PHONE_COLUMN_VIEWPORTS) {
  test(`profile content scrolls inside the phone column at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
    await waitForHydration(page);

    const surface = page.getByTestId('profile-compact-surface').first();
    const content = page.getByTestId('profile-content-scroll').first();
    await expect(content).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const [surfaceBox, contentBox] = await Promise.all([
      surface.boundingBox(),
      content.boundingBox(),
    ]);
    expect(surfaceBox && contentBox).toBeTruthy();
    if (!surfaceBox || !contentBox) return;
    expect(
      contentBox.y + contentBox.height,
      'content region must end inside the phone card'
    ).toBeLessThanOrEqual(surfaceBox.y + surfaceBox.height + 1);

    // Whatever overflows the card must be reachable by scrolling it.
    const { clientHeight, scrollHeight, overflowY } = await content.evaluate(
      node => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        overflowY: getComputedStyle(node).overflowY,
      })
    );
    if (scrollHeight > clientHeight + 1) {
      expect(['auto', 'scroll']).toContain(overflowY);
    }
  });
}
