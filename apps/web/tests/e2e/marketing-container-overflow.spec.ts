import { expect, test } from './setup';

/**
 * One boxed width, one full-bleed override: every boxed `.public-container`
 * on a marketing page shares the same left and right edge, and nothing
 * overflows the viewport horizontally.
 *
 * @layout-guard
 */

const ROUTES = ['/', '/pricing', '/blog'] as const;
// 320 to 1920: every common width, including the narrowest supported phone.
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

test.describe('marketing single container edges and overflow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${route} has one container edge at ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);

        // A clipping ancestor (overflow: hidden) hides overflow from
        // scrollWidth, so also assert that no rendered text line extends
        // past the viewport edge: that is how "text cut off at the right"
        // reads to a user without producing a scrollbar.
        const clipped = await page.evaluate(() => {
          const limit = document.documentElement.clientWidth + 0.5;
          const found: string[] = [];
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT
          );
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            if (!node.textContent?.trim() || !parent) continue;
            const style = getComputedStyle(parent);
            if (style.visibility === 'hidden' || style.display === 'none') {
              continue;
            }
            // Horizontally scrolling rails legitimately hold off-screen text.
            if (parent.closest('[class*="carousel"], [class*="marquee"]')) {
              continue;
            }
            let scrolls = false;
            for (
              let el: HTMLElement | null = parent;
              el;
              el = el.parentElement
            ) {
              const ox = getComputedStyle(el).overflowX;
              if (ox === 'auto' || ox === 'scroll') scrolls = true;
            }
            if (scrolls) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.width > 0 && rect.right > limit) {
                found.push(node.textContent.trim().slice(0, 40));
                break;
              }
            }
          }
          return found;
        });
        expect(clipped, 'text running past the right edge').toEqual([]);

        const edges = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '.public-container:not(.public-container--bleed)'
            ),
          ]
            .map(element => element.getBoundingClientRect())
            .filter(box => box.width > 0)
            .map(box => `${Math.round(box.left)}-${Math.round(box.right)}`)
        );
        expect(edges.length).toBeGreaterThan(0);
        expect(new Set(edges).size).toBe(1);
      });
    }
  }
});
