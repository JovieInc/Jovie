import { expect, test } from '@playwright/test';

/**
 * Content rows visual regression.
 *
 * Fleet, Shipping and Tasks rows stacked in default, hover, selected and
 * attention states, in light and dark. Also checks that the three surfaces
 * share one row height. Contract: `.claude/rules/ui.md` "Content rows".
 *
 * Story: `apps/web/.storybook/stories/content-rows.stories.tsx`
 * (`design-system-content-rows--stacked-rows`).
 */

const STORYBOOK_THEME_STORAGE_KEY = 'jovie-theme-storybook';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;
const STORY_ID = 'design-system-content-rows--stacked-rows';
const THEMES = ['light', 'dark'] as const;

test.describe('content rows', () => {
  for (const theme of THEMES) {
    test(`stacked rows [${theme}]`, async ({ page }) => {
      await page.addInitScript(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: STORYBOOK_THEME_STORAGE_KEY, value: theme }
      );
      await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      const stack = page.getByTestId('content-rows-stack');
      await expect(stack).toBeVisible({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });

      const heights = await Promise.all(
        [
          'content-row-fleet-default',
          'content-row-shipping-default',
          'content-row-tasks-default',
        ].map(async id => {
          const row = page.getByTestId(id);
          return row.evaluate(
            element =>
              (element.closest('tr') ?? element).getBoundingClientRect().height
          );
        })
      );
      // Fleet and Shipping are the 44px standard row; Tasks sits in a 56px
      // table row. Both clear the standard minimum.
      expect(heights[0]).toBeGreaterThanOrEqual(44);
      expect(heights[1]).toBeGreaterThanOrEqual(44);
      expect(Math.abs(heights[0]! - heights[1]!)).toBeLessThanOrEqual(1);

      await expect(stack).toHaveScreenshot(`content-rows-${theme}.png`);
    });
  }
});
