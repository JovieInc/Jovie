import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('JOV-4478 homepage proof corrections', () => {
  test('keeps the silver profile frame clean at the intentional desktop crop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const card = page.locator('.homepage-artist-outcome').first();
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card.locator('.ap-phone-frame__plate')).toHaveJSProperty(
      'complete',
      true
    );

    const geometry = await card.evaluate(element => {
      const media = element.querySelector<HTMLElement>(
        '.homepage-artist-outcome__media'
      );
      const device = element.querySelector<HTMLElement>(
        '.homepage-artist-outcome__device'
      );
      const plate = element.querySelector<HTMLImageElement>(
        '.ap-phone-frame__plate'
      );
      const screen = element.querySelector<HTMLImageElement>(
        '.homepage-artist-outcome__screen'
      );
      if (!media || !device || !plate || !screen) {
        throw new Error('Artist Profile device composition is incomplete');
      }

      const cardRect = element.getBoundingClientRect();
      const mediaRect = media.getBoundingClientRect();
      const deviceRect = device.getBoundingClientRect();
      return {
        cropDepth: deviceRect.bottom - cardRect.bottom,
        deviceWidthRatio: deviceRect.width / cardRect.width,
        mediaOverflow: getComputedStyle(media).overflow,
        topDelta: Math.abs(deviceRect.top - mediaRect.top),
        plateNaturalWidth: plate.naturalWidth,
        plateRenderedWidth: plate.getBoundingClientRect().width,
        screenSource: screen.currentSrc,
      };
    });

    expect(geometry.mediaOverflow).toBe('hidden');
    expect(geometry.topDelta).toBeLessThanOrEqual(1);
    expect(geometry.cropDepth).toBeGreaterThan(100);
    expect(geometry.deviceWidthRatio).toBeGreaterThanOrEqual(0.7);
    expect(geometry.deviceWidthRatio).toBeLessThanOrEqual(0.74);
    expect(geometry.plateNaturalWidth).toBeGreaterThanOrEqual(
      geometry.plateRenderedWidth * 2
    );
    expect(geometry.screenSource).toContain('tim-white-profile-listen-phone');

    await expect(card).toHaveScreenshot(
      'artist-profile-silver-frame-desktop.png'
    );
  });

  test('keeps The Deep End readable on one line with its full label exposed', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      '/exp/shell-v1?view=thread&thread=outcome-demo&capture=marketing&player=off',
      { waitUntil: 'networkidle' }
    );

    const drawer = page.getByTestId('shell-v1-release-drawer');
    const title = drawer.getByRole('heading', { name: 'The Deep End' });
    await expect(title).toBeVisible();
    await expect(title).toHaveAttribute('title', 'The Deep End');

    const metrics = await title.evaluate(element => {
      const style = getComputedStyle(element);
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        color: style.color,
        fontSize: style.fontSize,
        lineCount: Math.round(
          element.getBoundingClientRect().height /
            Number.parseFloat(style.lineHeight)
        ),
        renderedTextWidth: range.getBoundingClientRect().width,
        availableWidth: element.getBoundingClientRect().width,
      };
    });

    expect(metrics.fontSize).toBe('16px');
    expect(metrics.lineCount).toBe(1);
    expect(metrics.renderedTextWidth).toBeLessThanOrEqual(
      metrics.availableWidth + 1
    );
    expect(metrics.color).toBe('rgb(247, 248, 248)');

    await expect(drawer.locator('.shrink-0').first()).toHaveScreenshot(
      'the-deep-end-rail-title-desktop.png'
    );
  });
});
