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
    await page.evaluate(() => document.fonts.ready);
    const header = page.getByTestId('header-nav');
    await expect(header.getByRole('link')).toHaveCount(2);
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expect(
      page.getByRole('img', { name: 'Jovie', exact: true })
    ).toHaveCount(1);
    const headerHeight = (await header.boundingBox())!.height;
    const headerContainer = await header.getByRole('navigation').boundingBox();
    expect(headerContainer).not.toBeNull();
    expect(
      (await header.getByRole('link', { name: 'Sign in' }).boundingBox())!
        .height
    ).toBeGreaterThanOrEqual(44);
    const input = page
      .getByTestId('marketing-section-hero')
      .getByRole('textbox', { name: 'Your Name or Handle' });
    await input.focus();
    await expect(input).toBeFocused();
    const before = await input.boundingBox();
    const region = page.getByTestId('homepage-hero-scroll-region');
    expect((await region.boundingBox())!.height).toBe(844);
    const explanation = page.getByTestId('homepage-hero-explanation');
    const explanationBefore = (await explanation.boundingBox())!.y;
    await expect(page.getByTestId('homepage-hero-surface')).toHaveCSS(
      'clip-path',
      'inset(0px)'
    );
    expect((await region.boundingBox())!.y).toBe(0);
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const button = page.getByTestId('homepage-primary-cta');
    const buttonBefore = await button.boundingBox();
    await page.evaluate(() => {
      (
        window as Window & { heroCanvas?: HTMLCanvasElement | null }
      ).heroCanvas = document.querySelector('canvas');
    });
    const surface = page.getByTestId('homepage-hero-surface');
    const frames = [];
    const inset = headerContainer!.x;
    const blockInset =
      width >= 1024
        ? Math.max(inset, (844 - headerHeight - (width - inset * 2) / 2) / 2)
        : inset;
    for (const y of [0, 64, 128, 64, 0]) {
      await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), y);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
      const expectedInset = ((headerHeight + blockInset + 128) * y) / 128;
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
      await expect
        .poll(() =>
          header.evaluate(n => Number(getComputedStyle(n, '::before').opacity))
        )
        .toBe(0);
      await expect(input).toBeInViewport();
      expect(await input.boundingBox()).toEqual({
        ...before!,
        y: before!.y - y,
      });
      expect(await button.boundingBox()).toEqual({
        ...buttonBefore!,
        y: buttonBefore!.y - y,
      });
      expect((await explanation.boundingBox())!.y).toBe(explanationBefore - y);
      expect((await region.boundingBox())!.y + y).toBe(0);
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
          headerGlass: {
            opacity: getComputedStyle(
              document.querySelector('header')!,
              '::before'
            ).opacity,
            background: getComputedStyle(
              document.querySelector('header')!,
              '::before'
            ).backgroundColor,
            filter: getComputedStyle(
              document.querySelector('header')!,
              '::before'
            ).backdropFilter,
          },
        }))
      );
      await expect(header).toHaveCount(1);
      expect((await header.boundingBox())!.y).toBe(0);
      const clip = await surface.evaluate(n => getComputedStyle(n).clipPath);
      const values = clip
        .slice(clip.indexOf('(') + 1)
        .split('round')[0]
        .replace(')', '')
        .trim()
        .split(/\s+/)
        .map(Number.parseFloat);
      expect(values[1] ?? values[0]).toBeCloseTo((inset * y) / 128, 1);
      await page.screenshot({
        path: testInfo.outputPath(`frame-${y}-${frames.length}.png`),
      });
    }
    expect(frames.every(f => f.sameCanvas && !f.overflow)).toBe(true);
    // Before clearance, at clearance, and throughout the fade (and reverse):
    // the rounded card may not intersect the glass plane while it fades.
    for (const y of [
      127,
      128,
      128 + inset / 2,
      128 + inset,
      128 + inset / 2,
      127,
    ]) {
      await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), y);
      const opacity = y <= 128 ? 0 : (y - 128) / inset;
      await expect
        .poll(() =>
          header.evaluate(n => Number(getComputedStyle(n, '::before').opacity))
        )
        .toBeCloseTo(opacity, 2);
      if (opacity > 0 && opacity < 1) {
        const clipTop = await surface.evaluate(n =>
          Number.parseFloat(getComputedStyle(n).clipPath.replace('inset(', ''))
        );
        expect(
          (await region.boundingBox())!.y + clipTop
        ).toBeGreaterThanOrEqual(headerHeight);
      }
      await expect(input).toBeFocused();
      await page.screenshot({
        path: testInfo.outputPath(`clearance-${y}.png`),
      });
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.mouse.wheel(0, 128);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(128);
    await expect(input).toBeFocused();
    // Small wheel deltas exercise the trackpad-like path without event interception.
    await page.mouse.wheel(0, -64);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(64);
    await input.blur();
    for (const key of ['PageDown', 'Space']) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.keyboard.press(key);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      expect((await explanation.boundingBox())!.y).toBeLessThan(
        explanationBefore
      );
    }
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
    const input = page
      .getByTestId('marketing-section-hero')
      .getByRole('textbox', { name: 'Your Name or Handle' });
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
    expect(clip).toBe('inset(0px)');
    await page.evaluate(() => scrollTo({ top: 100, behavior: 'instant' }));
    await expect(surface).toHaveCSS('clip-path', clip);
    await expect(input).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('reduced-motion.png') });
  });
}
