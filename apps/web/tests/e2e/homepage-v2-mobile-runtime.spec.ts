import { APP_ROUTES } from '@/constants/routes';
import { assertScrollable } from '../helpers/scroll-assertions';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

async function gotoHomepageV2(page: import('@playwright/test').Page) {
  const response = await page.goto(APP_ROUTES.LANDING_NEW, {
    waitUntil: 'domcontentloaded',
  });

  expect(response?.status() ?? 500).toBeLessThan(400);
  await page.waitForLoadState('load');
  await expect(page.getByTestId('homepage-v2-shell')).toBeVisible();
}

test.describe('/new mobile runtime contract', () => {
  test('keeps the real document scrollable at 390px without failed images', async ({
    page,
  }) => {
    const failedImages: string[] = [];
    page.on('response', response => {
      if (
        response.status() >= 400 &&
        response.request().resourceType() === 'image'
      ) {
        failedImages.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHomepageV2(page);

    await expect(page.locator('.profile-viewport')).toHaveCount(1);
    await expect(page.locator('body > .profile-viewport')).toHaveCount(0);

    await assertScrollable(page, {
      viewportWidth: 390,
      viewportHeight: 844,
      wheelDelta: 900,
    });

    expect(failedImages).toEqual([]);
  });

  test('stops decorative infinite animations when reduced motion is requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHomepageV2(page);

    const animationStates = await page
      .locator('.homepage-v2-hero__phone-float, .homepage-v2-hero__shot')
      .evaluateAll(nodes =>
        nodes.map(node => ({
          animationName: getComputedStyle(node).animationName,
          activeAnimations: node.getAnimations().length,
        }))
      );

    expect(animationStates).toHaveLength(4);
    for (const state of animationStates) {
      expect(state).toEqual({ animationName: 'none', activeAnimations: 0 });
    }
  });
});
