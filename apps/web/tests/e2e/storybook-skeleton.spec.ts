import { expect, type Page, test } from '@playwright/test';

const REDUCED_MOTION_STORY_ID = 'ui-loadingskeleton--reduced-motion';
const BUTTON_GEOMETRY_STORY_ID =
  'ui-loadingskeleton--button-geometry-comparison';

async function openStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
}

test('reduced motion removes shimmer while preserving the tokenized fill', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStory(page, REDUCED_MOTION_STORY_ID);

  const skeleton = page.locator('[data-slot="skeleton"]').first();
  await expect(skeleton).toBeVisible();

  const style = await skeleton.evaluate(element => {
    const computed = getComputedStyle(element);
    return {
      animationName: computed.animationName,
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
    };
  });

  expect(style.animationName).toBe('none');
  expect(style.backgroundImage).toBe('none');
  expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.backgroundColor).not.toBe('transparent');
});

test('ButtonSkeleton preserves the loaded button geometry', async ({
  page,
}) => {
  await openStory(page, BUTTON_GEOMETRY_STORY_ID);

  const skeleton = page
    .getByTestId('button-skeleton-geometry')
    .locator('[data-slot="skeleton"]');
  const loadedButton = page.getByTestId('loaded-button-geometry');
  await expect(skeleton).toBeVisible();
  await expect(loadedButton).toBeVisible();

  const [skeletonBox, loadedBox] = await Promise.all([
    skeleton.boundingBox(),
    loadedButton.boundingBox(),
  ]);
  expect(skeletonBox).not.toBeNull();
  expect(loadedBox).not.toBeNull();
  expect(skeletonBox?.width).toBe(loadedBox?.width);
  expect(skeletonBox?.height).toBe(loadedBox?.height);
});
