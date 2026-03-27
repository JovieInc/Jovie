import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  getScreenshotScenario,
  SCREENSHOT_SCENARIOS,
  SCREENSHOT_VIEWPORTS,
} from '../../lib/screenshots/registry';
import type { ScreenshotManifestEntry } from '../../lib/screenshots/types';
import {
  assertNoDevOverlays,
  CATALOG_OUTPUT_DIR,
  hideTransientUI,
  PUBLIC_EXPORT_DIR,
  TIMEOUTS,
  waitForImages,
  waitForSettle,
} from './helpers';

async function ensureDirectory(path: string) {
  await mkdir(path, { recursive: true });
}

async function clearOwnedOutputs() {
  await ensureDirectory(CATALOG_OUTPUT_DIR);
  await ensureDirectory(PUBLIC_EXPORT_DIR);

  for (const scenario of SCREENSHOT_SCENARIOS) {
    await rm(join(CATALOG_OUTPUT_DIR, `${scenario.id}.png`), { force: true });
    if (scenario.publicExportPath) {
      await rm(join(PUBLIC_EXPORT_DIR, scenario.publicExportPath), {
        force: true,
      });
    }
  }
}

async function removeOrphanCatalogFiles() {
  const ownedCatalogFiles = new Set(
    SCREENSHOT_SCENARIOS.map(scenario => `${scenario.id}.png`).concat(
      'manifest.json'
    )
  );
  const catalogFiles = await readdir(CATALOG_OUTPUT_DIR).catch(() => []);

  await Promise.all(
    catalogFiles
      .filter(file => !ownedCatalogFiles.has(file))
      .map(file => rm(join(CATALOG_OUTPUT_DIR, file), { force: true }))
  );
}

async function prepareScenario(
  page: import('@playwright/test').Page,
  id: string
) {
  const scenario = getScreenshotScenario(id);
  if (!scenario) {
    throw new Error(`Unknown screenshot scenario: ${id}`);
  }

  const viewport = SCREENSHOT_VIEWPORTS[scenario.viewport];
  await page.setViewportSize(viewport);
  await page.goto(scenario.route, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.NAVIGATION,
  });

  const initialWaitSelector =
    scenario.interaction === 'open-first-release'
      ? '[data-testid="releases-matrix"]'
      : scenario.waitFor;
  const initialWait = page.locator(initialWaitSelector).first();
  await expect(initialWait).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });

  if (scenario.interaction === 'open-first-release') {
    await waitForImages(page, 'table').catch(() => {});
    await waitForSettle(page, 2000);
    await page.locator('tbody tr').first().click();
    await expect(page.locator(scenario.waitFor).first()).toBeVisible({
      timeout: TIMEOUTS.SIDEBAR_VISIBLE,
    });
  }

  await waitForImages(page).catch(() => {});
  await waitForSettle(page);
  await hideTransientUI(page);
  await assertNoDevOverlays(page);

  return scenario;
}

test.describe('Screenshot Catalog', () => {
  test.beforeAll(async () => {
    await clearOwnedOutputs();
  });

  test('captures the canonical screenshot catalog', async ({ page }) => {
    test.setTimeout(600_000);
    const manifestEntries: ScreenshotManifestEntry[] = [];
    const gitSha = process.env.GITHUB_SHA ?? null;

    for (const scenario of SCREENSHOT_SCENARIOS) {
      console.log(`📸 Capturing ${scenario.id}`);
      const preparedScenario = await prepareScenario(page, scenario.id);
      const catalogPath = join(CATALOG_OUTPUT_DIR, `${scenario.id}.png`);

      if (
        preparedScenario.captureTarget === 'locator' &&
        preparedScenario.captureSelector
      ) {
        await page
          .locator(preparedScenario.captureSelector)
          .first()
          .screenshot({ path: catalogPath });
      } else {
        await page.screenshot({
          path: catalogPath,
          fullPage: preparedScenario.fullPage,
        });
      }

      if (preparedScenario.publicExportPath) {
        await copyFile(
          catalogPath,
          join(PUBLIC_EXPORT_DIR, preparedScenario.publicExportPath)
        );
      }

      manifestEntries.push({
        id: preparedScenario.id,
        title: preparedScenario.title,
        group: preparedScenario.group,
        groupLabel: preparedScenario.groupLabel,
        route: preparedScenario.route,
        viewport: preparedScenario.viewport,
        theme: preparedScenario.theme,
        consumers: preparedScenario.consumers,
        capturedAt: new Date().toISOString(),
        gitSha,
        imagePath: `${preparedScenario.id}.png`,
        publicExportPath: preparedScenario.publicExportPath,
      });
    }

    await writeFile(
      join(CATALOG_OUTPUT_DIR, 'manifest.json'),
      JSON.stringify(manifestEntries, null, 2) + '\n',
      'utf8'
    );
    await removeOrphanCatalogFiles();
  });
});
