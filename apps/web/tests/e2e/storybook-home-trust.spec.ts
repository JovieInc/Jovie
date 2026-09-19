import { expect, test } from '@playwright/test';

const STORY_ID = 'marketing-sections-hometrustsection--inline-strip';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`HomeTrustSection keeps every logo ink inside its mounted slot [${viewport.name}]`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
      waitUntil: 'domcontentloaded',
    });

    const root = page.locator('#storybook-root');
    await expect(root).toBeVisible({ timeout: 60_000 });
    const slots = root.locator('.homepage-trust-logo-slot:visible');
    await expect(slots).toHaveCount(5);
    await page.evaluate(() => document.fonts.ready);

    const ink = await slots.evaluateAll(async elements => {
      const images = elements.flatMap(element =>
        Array.from(element.querySelectorAll<HTMLImageElement>('img'))
      );
      await Promise.all(
        images.map(image => image.decode().catch(() => undefined))
      );

      return elements.map(slot => {
        const artwork = slot.querySelector<SVGSVGElement | HTMLImageElement>(
          'svg, img'
        );
        if (!artwork) throw new Error('Trust logo artwork missing');
        const frame = slot.getBoundingClientRect();

        if (artwork instanceof SVGSVGElement) {
          const bounds = artwork.getBBox();
          const matrix = artwork.getScreenCTM();
          if (!matrix) throw new Error('Trust logo transform missing');
          const corners = [
            new DOMPoint(bounds.x, bounds.y),
            new DOMPoint(bounds.x + bounds.width, bounds.y),
            new DOMPoint(bounds.x, bounds.y + bounds.height),
            new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height),
          ].map(point => point.matrixTransform(matrix));
          return {
            left: Math.min(...corners.map(point => point.x)),
            right: Math.max(...corners.map(point => point.x)),
            top: Math.min(...corners.map(point => point.y)),
            bottom: Math.max(...corners.map(point => point.y)),
            frameLeft: frame.left,
            frameRight: frame.right,
            frameTop: frame.top,
            frameBottom: frame.bottom,
          };
        }

        const canvas = document.createElement('canvas');
        canvas.width = artwork.naturalWidth;
        canvas.height = artwork.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context || canvas.width === 0 || canvas.height === 0) {
          throw new Error('Trust logo raster cannot be inspected');
        }
        context.drawImage(artwork, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        ).data;
        let left = canvas.width;
        let right = -1;
        let top = canvas.height;
        let bottom = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
        if (right < left || bottom < top) {
          throw new Error('Trust logo raster has no visible ink');
        }
        const bounds = artwork.getBoundingClientRect();
        const scaleX = bounds.width / artwork.naturalWidth;
        const scaleY = bounds.height / artwork.naturalHeight;
        return {
          left: bounds.left + left * scaleX,
          right: bounds.left + (right + 1) * scaleX,
          top: bounds.top + top * scaleY,
          bottom: bounds.top + (bottom + 1) * scaleY,
          frameLeft: frame.left,
          frameRight: frame.right,
          frameTop: frame.top,
          frameBottom: frame.bottom,
        };
      });
    });

    for (const logo of ink) {
      expect(logo.left).toBeGreaterThanOrEqual(logo.frameLeft - 1);
      expect(logo.right).toBeLessThanOrEqual(logo.frameRight + 1);
      expect(logo.top).toBeGreaterThanOrEqual(logo.frameTop - 1);
      expect(logo.bottom).toBeLessThanOrEqual(logo.frameBottom + 1);
      expect(logo.left).toBeGreaterThanOrEqual(0);
      expect(logo.right).toBeLessThanOrEqual(viewport.width);
    }
  });
}
