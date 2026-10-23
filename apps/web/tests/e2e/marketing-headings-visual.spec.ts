import { expect, type Locator, test } from '@playwright/test';
import { SCREENSHOT_VIEWPORTS } from '@/lib/screenshots/registry';
import { inspectRouteDom } from './utils/route-dom-detector';

async function measureHeading(heading: Locator) {
  return heading.evaluate(element => {
    const style = getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight);
    // The shared H1 contract reserves padding for descenders outside line boxes.
    const blockInsets = [
      style.paddingTop,
      style.paddingBottom,
      style.borderTopWidth,
      style.borderBottomWidth,
    ].reduce((total, value) => total + Number.parseFloat(value), 0);
    const paintedHeight = element.getBoundingClientRect().height;
    const previousStyle = element.getAttribute('style');
    let fullHeight: number;
    try {
      for (const [property, value] of [
        ['-webkit-line-clamp', 'unset'],
        ['max-block-size', 'none'],
        ['max-height', 'none'],
        // Reserved layout height is not part of the natural text height.
        ['min-block-size', '0'],
        ['min-height', '0'],
      ] as const) {
        element.style.setProperty(property, value, 'important');
      }
      fullHeight = element.getBoundingClientRect().height;
    } finally {
      if (previousStyle === null) element.removeAttribute('style');
      else element.setAttribute('style', previousStyle);
    }
    return {
      contentHeight: fullHeight - blockInsets,
      fullHeight,
      lineHeight,
      paintedHeight,
    };
  });
}

for (const lines of [2, 3]) {
  test(`heading measurement distinguishes ${lines} lines from descender padding`, async ({
    page,
  }) => {
    await page.setContent(`
      <h1 style="box-sizing:border-box;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:51px;min-height:${lines === 2 ? 70 : 0}px;margin:0;font-size:20px;line-height:20px;padding-bottom:7px;border:2px solid">
        ${Array.from({ length: lines }, () => 'Heading').join('<br>')}
      </h1>
    `);
    const heading = page.getByRole('heading', { level: 1 });
    const originalStyle = await heading.getAttribute('style');
    const geometry = await measureHeading(heading);
    expect(geometry.contentHeight).toBeCloseTo(geometry.lineHeight * lines);
    expect(geometry.contentHeight > geometry.lineHeight * 2 + 1).toBe(
      lines === 3
    );
    expect(geometry.fullHeight - geometry.paintedHeight > 1).toBe(lines === 3);
    await expect(heading).toHaveAttribute('style', originalStyle ?? '');
  });
}

// JOV-7772: baseline allowances cannot certify the hero contract. Check both
// complete text and two natural lines so removing a clamp cannot hide a failure.
for (const route of [
  '/about',
  '/ai',
  '/artist-notifications',
  '/download',
  '/launch',
  '/voice',
  '/youtube-thumbnails',
]) {
  const viewports = [
    { name: 'desktop', size: SCREENSHOT_VIEWPORTS.desktop },
    { name: 'mobile', size: SCREENSHOT_VIEWPORTS.mobile },
    // At lg the download hero splits into columns before the xl type fits.
    ...(route === '/download'
      ? [{ name: 'split-desktop', size: { width: 1024, height: 900 } }]
      : []),
  ];
  for (const viewport of viewports) {
    test(`marketing H1 contract: ${route} ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport.size);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const response = await page.goto(route, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const geometry = await measureHeading(heading);
      expect(geometry.lineHeight).toBeGreaterThan(0);
      expect(
        geometry.contentHeight,
        'Complete authored H1 must fit in two natural lines'
      ).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1);
      expect(
        geometry.fullHeight - geometry.paintedHeight,
        'H1 must not hide any authored lines'
      ).toBeLessThanOrEqual(1);
      const snapshot = await inspectRouteDom(page, { surface: 'marketing' });
      expect(
        snapshot.findings.filter(finding => finding.kind === 'clipped-heading')
      ).toEqual([]);
      await testInfo.attach('hero', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}
