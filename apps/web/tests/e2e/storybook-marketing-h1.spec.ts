import { expect, test } from '@playwright/test';

const LONG_HEADING =
  'A deliberately long marketing headline that must keep every word available to assistive technology while never painting more than two visual lines at any supported viewport';
const STORY_ID = 'marketing-sections-marketingposterhero--overlong-headline';
const VIEWPORTS = [
  { label: 'compact', width: 320, height: 740 },
  { label: 'mobile', width: 390, height: 844 },
  { label: 'narrow', width: 440, height: 900 },
  { label: 'medium', width: 768, height: 1024 },
  { label: 'wide', width: 1280, height: 800 },
  { label: 'desktop', width: 1440, height: 900 },
] as const;

async function settleLayout(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

test.describe('shared marketing H1 visual-line contract', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label} paints no more than two lines without shortening accessible text`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });

      const heading = page.getByRole('heading', {
        level: 1,
        name: LONG_HEADING,
        exact: true,
      });
      await expect(heading).toBeVisible({ timeout: 60_000 });
      await settleLayout(page);

      const firstBox = await heading.boundingBox();
      await settleLayout(page);
      expect(await heading.boundingBox()).toEqual(firstBox);

      const metrics = await heading.evaluate(element => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        return {
          clientHeight: element.clientHeight,
          fullText: element.textContent,
          lines: Math.ceil(
            element.getBoundingClientRect().height / lineHeight - 0.05
          ),
          scrollHeight: element.scrollHeight,
        };
      });

      expect(metrics.fullText).toBe(LONG_HEADING);
      expect(
        metrics.lines,
        `${viewport.label} H1 painted ${metrics.lines} lines; the shared contract permits at most two`
      ).toBeLessThanOrEqual(2);
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
      console.log(
        `[marketing-h1-proof] ${JSON.stringify({ ...viewport, ...metrics })}`
      );
      await testInfo.attach('rendered-line-count.json', {
        body: JSON.stringify({ ...viewport, ...metrics }, null, 2),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: testInfo.outputPath(`marketing-h1-${viewport.label}.png`),
        fullPage: true,
      });
    });
  }
});
