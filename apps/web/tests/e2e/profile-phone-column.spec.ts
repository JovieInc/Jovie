import { expect, test } from './setup';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * From md up to 1023px the public profile renders its compact surface as a
 * fixed-height phone card. Its content region must stay inside that card and
 * scroll, or rows run under the tab bar and can never be reached (jov.ie/tim
 * dogfood 2026-09-27).
 *
 * The invariant intentionally stops below 1024px: at >= 1024px the profile is
 * a document-scrolling canvas, not a phone card (Tim 2026-10-25, #23305) —
 * the dock becomes a static top tab row and the document owns scroll, so the
 * dock-overlap hazard this spec guards cannot occur there. That desktop
 * composition is pinned by tests/e2e/profile/public-profile-desktop-layout.spec.ts,
 * which also asserts desktop never regresses to a floating phone card.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PHONE_COLUMN_VIEWPORTS = [
  { name: 'tablet', width: 768, height: 1024 },
  // Upper edge of the phone-card range (the 1024px desktop canvas starts
  // here, so 1000px is the widest viewport where the card contract binds).
  { name: 'tablet-wide', width: 1000, height: 800 },
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
    const navigation = page.getByTestId('profile-bottom-nav').first();
    await expect(content).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    await expect(navigation).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const [surfaceBox, contentBox, navigationBox] = await Promise.all([
      surface.boundingBox(),
      content.boundingBox(),
      navigation.boundingBox(),
    ]);
    expect(surfaceBox && contentBox && navigationBox).toBeTruthy();
    if (!surfaceBox || !contentBox || !navigationBox) return;
    expect(
      contentBox.y + contentBox.height,
      'content region must end inside the phone card'
    ).toBeLessThanOrEqual(surfaceBox.y + surfaceBox.height + 1);
    expect(
      contentBox.y + contentBox.height,
      'the floating dock must not cover the visible content scroll box'
    ).toBeLessThanOrEqual(navigationBox.y + 1);

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
