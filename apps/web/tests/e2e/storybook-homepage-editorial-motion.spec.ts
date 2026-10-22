import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Native motion review explicitly opts out of Storybook's frozen snapshot
// timing. API/router fixtures remain in place: this is not real claim/auth.
for (const width of [390, 1280]) {
  test(`homepage card preserves controls through forward and reverse scroll at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(
      '/iframe.html?id=marketing-homepageidentityhero--default&viewMode=story&jovie-motion=live'
    );
    const input = page.getByRole('textbox', { name: 'Choose Your Handle' });
    await input.focus();
    await expect(input).toBeFocused();
    const before = await input.boundingBox();
    const button = page.getByTestId('homepage-primary-cta');
    const buttonBefore = await button.boundingBox();
    await page.evaluate(() => {
      (
        window as Window & { heroCanvas?: HTMLCanvasElement | null }
      ).heroCanvas = document.querySelector('canvas');
    });
    const surface = page.getByTestId('homepage-hero-surface');
    const frames = [];
    const inset = width === 390 ? 32 : 48;
    for (const y of [0, 144, 288, 144, 0]) {
      await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), y);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
      const expectedInset = (inset * y) / 288;
      await expect
        .poll(async () =>
          Number.parseFloat(
            (await surface.evaluate(n => getComputedStyle(n).clipPath)).replace(
              'inset(',
              ''
            )
          )
        )
        .toBeCloseTo(expectedInset, 1);
      await expect(input).toBeFocused();
      await expect(input).toBeInViewport();
      expect(await input.boundingBox()).toEqual(before);
      expect(await button.boundingBox()).toEqual(buttonBefore);
      frames.push(
        await page.evaluate(() => ({
          scrollY,
          clip: getComputedStyle(
            document.querySelector('[data-testid="homepage-hero-surface"]')!
          ).clipPath,
          sameCanvas:
            (window as Window & { heroCanvas?: HTMLCanvasElement | null })
              .heroCanvas === document.querySelector('canvas'),
          overflow: document.documentElement.scrollWidth > innerWidth,
        }))
      );
      await page.screenshot({
        path: testInfo.outputPath(`frame-${y}-${frames.length}.png`),
      });
    }
    expect(frames.every(f => f.sameCanvas && !f.overflow)).toBe(true);
    await page.mouse.wheel(0, 288);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(288);
    await expect(input).toBeFocused();
    await writeFile(
      testInfo.outputPath('scroll-receipt.json'),
      JSON.stringify(
        {
          width,
          frames,
          errors,
          boundary:
            'Existing component and native scrolling; Storybook API/router fixture, no real auth or GPU performance certification.',
        },
        null,
        2
      )
    );
    expect(errors).toEqual([]);
  });

  test(`reduced motion keeps a still card and no extra scroll runway at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      '/iframe.html?id=marketing-homepageidentityhero--default&viewMode=story&jovie-motion=live'
    );
    const input = page.getByRole('textbox', { name: 'Choose Your Handle' });
    await input.focus();
    await expect(input).toBeInViewport();
    await expect(page.getByTestId('marketing-ambient-field')).toHaveAttribute(
      'data-live',
      'false'
    );
    const surface = page.getByTestId('homepage-hero-surface');
    await expect(surface).toHaveCSS('animation-name', 'none');
    expect(
      (await page.getByTestId('homepage-hero-scroll-region').boundingBox())
        ?.height
    ).toBe(844);
    const clip = await surface.evaluate(n => getComputedStyle(n).clipPath);
    await page.evaluate(() => scrollTo({ top: 100, behavior: 'instant' }));
    await expect(surface).toHaveCSS('clip-path', clip);
    await expect(input).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('reduced-motion.png') });
  });
}
