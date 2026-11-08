import { expect, type Locator } from '@playwright/test';

/**
 * Truthful draft-profile checks (2026-11-08). The Golden Path used to pass
 * when the preview's release count was at least one, even while the portrait
 * and the release artwork were empty grey shapes and the panel shouted in
 * all caps. These checks fail on what a visitor actually sees.
 */

const MEDIA_TIMEOUT_MS = 15_000;

async function readImage(img: Locator) {
  return img.evaluate(element => {
    const image = element as HTMLImageElement;
    const style = getComputedStyle(image);
    return {
      painted:
        image.complete &&
        image.naturalWidth > 0 &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0,
      src: image.currentSrc || image.src,
    };
  });
}

async function expectImagePainted(img: Locator, what: string): Promise<void> {
  await expect(
    img,
    `${what} rendered a placeholder instead of the source image`
  ).toHaveCount(1, { timeout: MEDIA_TIMEOUT_MS });
  await expect
    .poll(async () => (await readImage(img)).painted, {
      message: `${what} did not paint within ${MEDIA_TIMEOUT_MS / 1000}s`,
      timeout: MEDIA_TIMEOUT_MS,
    })
    .toBe(true);
}

/**
 * The artist portrait and the featured release artwork are real, loaded
 * images. Use for artists whose Spotify data has both (the cert fixtures do).
 */
export async function expectPreviewMediaPainted(rail: Locator): Promise<void> {
  await expectImagePainted(
    rail.getByTestId('profile-identity-portrait').locator('img').first(),
    'Preview artist portrait'
  );
  await expectImagePainted(
    rail.locator('img[alt$=" artwork"]').first(),
    'Preview release artwork'
  );
}

/**
 * No visible text inside `scope` is forced into capitals by CSS. Artist and
 * release names keep their own spelling; this only bans the UI shouting.
 */
export async function expectNoForcedCaps(scope: Locator): Promise<void> {
  const shouting = await scope.evaluate(root => {
    const found: string[] = [];
    for (const element of Array.from(root.querySelectorAll('*'))) {
      const style = getComputedStyle(element);
      if (style.textTransform !== 'uppercase') continue;
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const ownText = Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      if (ownText) found.push(ownText);
    }
    return found;
  });
  expect(shouting, 'UI text is forced into all caps').toEqual([]);
}
