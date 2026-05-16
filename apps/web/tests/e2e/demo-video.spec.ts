import { expect, test } from '@playwright/test';
import sharp from 'sharp';

type PosterStats =
  | {
      readonly brightPixelRatio: number;
      readonly max: number;
      readonly status: 'available';
    }
  | {
      readonly reason: string;
      readonly status: 'unavailable';
    };

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 900 },
});

test('demovideo renders a stable non-empty initial visual', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];

  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('requestfailed', request => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`
    );
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/demovideo', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await expect(page.getByTestId('demo-video-page')).toBeVisible();
  await expect(page.getByTestId('dev-toolbar')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/\bYC\b/u);

  const visual = page.getByTestId('demo-video-visual');
  await expect(visual).toBeVisible();

  const visualBox = await visual.boundingBox();
  expect(visualBox).not.toBeNull();
  if (!visualBox) {
    throw new Error('Missing demo video visual bounds');
  }
  expect(visualBox.width / visualBox.height).toBeCloseTo(16 / 9, 1);

  const poster = page.getByTestId('demo-video-poster');
  await expect(poster).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Play Jovie demo video' })
  ).toBeVisible();
  await expect
    .poll(() =>
      poster.evaluate(element => {
        if (!(element instanceof HTMLImageElement)) {
          return false;
        }
        return (
          element.complete &&
          element.naturalWidth >= 1280 &&
          element.naturalHeight >= 720
        );
      })
    )
    .toBe(true);

  const posterStats = await page.evaluate(async (): Promise<PosterStats> => {
    const video = document.querySelector(
      'video[aria-label="Jovie demo video"]'
    );
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error('Demo video element is missing');
    }

    const posterUrl = new URL(video.poster, globalThis.location.href);
    const isCrossOrigin = posterUrl.origin !== globalThis.location.origin;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = posterUrl.href;
    try {
      await image.decode();
    } catch (error) {
      if (isCrossOrigin) {
        return {
          reason: 'Cross-origin poster image is not CORS-readable',
          status: 'unavailable',
        };
      }
      throw error;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is unavailable');
    }

    let data: Uint8ClampedArray;
    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch (error) {
      if (
        isCrossOrigin &&
        error instanceof DOMException &&
        error.name === 'SecurityError'
      ) {
        return {
          reason: 'Cross-origin poster canvas is not CORS-readable',
          status: 'unavailable',
        };
      }
      throw error;
    }

    let max = 0;
    let brightPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luminance =
        0.2126 * data[index] +
        0.7152 * data[index + 1] +
        0.0722 * data[index + 2];
      max = Math.max(max, luminance);
      if (luminance > 45) {
        brightPixels += 1;
      }
    }

    return {
      brightPixelRatio: brightPixels / (canvas.width * canvas.height),
      max,
      status: 'available',
    };
  });
  if (posterStats.status === 'available') {
    expect(posterStats.max).toBeGreaterThan(120);
    expect(posterStats.brightPixelRatio).toBeGreaterThan(0.01);
  } else {
    expect(posterStats.reason).toContain('CORS-readable');
  }

  const screenshotPath = testInfo.outputPath('demo-video-visual.png');
  const screenshot = await visual.screenshot({ path: screenshotPath });
  await testInfo.attach('demo-video-visual', {
    path: screenshotPath,
    contentType: 'image/png',
  });
  const screenshotStats = await sharp(screenshot).greyscale().stats();
  expect(screenshotStats.channels[0].max).toBeGreaterThan(120);
  expect(screenshotStats.channels[0].stdev).toBeGreaterThan(5);

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(failedResponses).toEqual([]);
});
