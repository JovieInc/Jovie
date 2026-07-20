import { assertScrollable } from '../helpers/scroll-assertions';
import { expect, test } from './setup';

/**
 * Marketing pages opt out of the app shell's document scroll lock through the
 * semantic System B wrapper. A real wheel assertion catches regressions that
 * scrollIntoView would hide.
 *
 * @scroll @layout-guard
 */

test.describe('marketing document scroll contract', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const cases = [
    { route: '/pay', label: 'pay' },
    { route: '/launch/pricing', label: 'launch pricing' },
  ] as const;

  for (const { route, label } of cases) {
    for (const viewport of [
      { width: 375, height: 667, name: 'mobile' },
      { width: 1280, height: 720, name: 'desktop' },
    ] as const) {
      test(`${label} scrolls on ${viewport.name}`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator('.system-b-marketing')).toBeVisible();
        await assertScrollable(page, {
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
        });
      });
    }
  }
});
