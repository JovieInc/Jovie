import { expect, test } from '@playwright/test';

/**
 * Audience table visual regression (Linear-parity density).
 *
 * Populated Audience table at 1440 wide in light and dark: dense 32px rows,
 * quiet dot status, no row numbers, no empty columns, flat crawler status.
 * Contract: DRI-21 canonical table row density.
 *
 * Story: `DashboardAudienceTableUnified.stories.tsx`
 * (`dashboard-audience-dashboardaudiencetableunified--populated`).
 */

const STORYBOOK_THEME_STORAGE_KEY = 'jovie-theme-storybook';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;
const STORY_ID = 'dashboard-audience-dashboardaudiencetableunified--populated';
const THEMES = ['light', 'dark'] as const;

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('audience table', () => {
  for (const theme of THEMES) {
    test(`populated [${theme}]`, async ({ page }) => {
      await page.addInitScript(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: STORYBOOK_THEME_STORAGE_KEY, value: theme }
      );
      await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      const table = page.getByRole('table').first();
      await expect(table).toBeVisible({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });

      const row = table.locator('tbody tr').first();
      const height = await row.evaluate(
        element => element.getBoundingClientRect().height
      );
      expect(height).toBe(32);

      await expect(page).toHaveScreenshot(`audience-table-${theme}.png`);
    });
  }
});
