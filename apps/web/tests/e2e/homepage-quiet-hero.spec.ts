import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

const LOCKED_HEADLINE = 'Own your story. Know your audience. Never lose a fan.';
const VIEWPORTS = [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 900 },
] as const;

test.use({ storageState: { cookies: [], origins: [] } });

async function settleLayout(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

test.describe('founder-locked Quiet homepage hero', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label} keeps the locked H1 complete and within two visual lines`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);

      const heading = page.getByRole('heading', {
        level: 1,
        name: LOCKED_HEADLINE,
        exact: true,
      });
      await expect(heading).toBeVisible();
      await settleLayout(page);

      const firstBox = await heading.boundingBox();
      await settleLayout(page);
      expect(await heading.boundingBox()).toEqual(firstBox);

      const metrics = await heading.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          fullText: element.textContent,
          lines: Math.ceil(
            element.getBoundingClientRect().height /
              Number.parseFloat(style.lineHeight) -
              0.05
          ),
        };
      });

      expect(metrics.fullText).toBe(LOCKED_HEADLINE);
      expect(metrics.lines).toBeLessThanOrEqual(2);
      await page.screenshot({
        path: testInfo.outputPath(`quiet-hero-${viewport.label}.png`),
        fullPage: false,
      });
    });
  }
});
