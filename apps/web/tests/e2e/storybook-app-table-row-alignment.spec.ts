import { expect, test } from '@playwright/test';
import { assertRowAlignment } from './helpers/assert-row-alignment';

/**
 * Geometric CI gate for the shared app table/list row primitive (JOV-14762).
 * Storybook fixtures keep this hermetic — no live auth required.
 */

test.describe('app table row alignment', () => {
  test('library catalog dense rows share one vertical center', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      '/iframe.html?id=library-workinspector--dense-scan-with-inspector&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const rows = page.locator('[data-testid^="library-catalog-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 90_000 });

    await assertRowAlignment(page, {
      rows,
      expectedHeightPx: 32,
      assertHoverStability: true,
    });
  });

  test('shell release rows share one vertical center without hover shift', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      '/iframe.html?id=dashboard-releases-shellreleaserow--default&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const rows = page.locator('[data-shell-release-row]');
    await expect(rows.first()).toBeVisible({ timeout: 90_000 });

    await assertRowAlignment(page, {
      rows,
      expectedHeightPx: 32,
      assertHoverStability: true,
    });
  });
});
