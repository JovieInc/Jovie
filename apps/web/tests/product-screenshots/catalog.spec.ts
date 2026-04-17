import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  getScreenshotScenario,
  SCREENSHOT_SCENARIOS,
  SCREENSHOT_VIEWPORTS,
} from '../../lib/screenshots/registry';
import {
  isScreenshotManifestEntry,
  type ScreenshotManifestEntry,
} from '../../lib/screenshots/types';
import {
  assertNoDevOverlays,
  CATALOG_OUTPUT_DIR,
  hideTransientUI,
  PUBLIC_EXPORT_DIR,
  SCREENSHOT_CLOCK_ISO,
  TIMEOUTS,
  waitForImages,
  waitForSettle,
} from './helpers';

const MANIFEST_PATH = join(CATALOG_OUTPUT_DIR, 'manifest.json');

async function ensureDirectory(path: string) {
  await mkdir(path, { recursive: true });
}

async function readOptionalFile(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function removeOrphanFiles(
  directory: string,
  ownedFiles: ReadonlySet<string>
) {
  const files = await readdir(directory).catch(() => []);
  await Promise.all(
    files
      .filter(file => !ownedFiles.has(file))
      .map(file => rm(join(directory, file), { force: true, recursive: true }))
  );
}

async function readManifestEntries() {
  const existingManifest = await readFile(MANIFEST_PATH, 'utf8').catch(
    error => {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }
  );

  if (!existingManifest) {
    return new Map<string, ScreenshotManifestEntry>();
  }

  try {
    const parsed = JSON.parse(existingManifest);
    if (!Array.isArray(parsed)) {
      return new Map<string, ScreenshotManifestEntry>();
    }

    return new Map(
      parsed
        .filter(isScreenshotManifestEntry)
        .map(entry => [entry.id, entry] as const)
    );
  } catch {
    return new Map<string, ScreenshotManifestEntry>();
  }
}

function sameValueArray(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function hasSameStableManifestFields(
  previousEntry: ScreenshotManifestEntry,
  nextEntry: ScreenshotManifestEntry
) {
  return (
    previousEntry.id === nextEntry.id &&
    previousEntry.title === nextEntry.title &&
    previousEntry.group === nextEntry.group &&
    previousEntry.groupLabel === nextEntry.groupLabel &&
    previousEntry.canonicalSurfaceId === nextEntry.canonicalSurfaceId &&
    previousEntry.canonicalSurfaceLabel === nextEntry.canonicalSurfaceLabel &&
    previousEntry.canonicalSurfaceReviewRoute ===
      nextEntry.canonicalSurfaceReviewRoute &&
    previousEntry.route === nextEntry.route &&
    previousEntry.viewport === nextEntry.viewport &&
    previousEntry.theme === nextEntry.theme &&
    sameValueArray(previousEntry.consumers, nextEntry.consumers) &&
    previousEntry.imagePath === nextEntry.imagePath &&
    previousEntry.publicExportPath === nextEntry.publicExportPath
  );
}

async function writeManifest(
  manifestEntriesById: ReadonlyMap<string, ScreenshotManifestEntry>
) {
  const orderedEntries = SCREENSHOT_SCENARIOS.flatMap(scenario => {
    const entry = manifestEntriesById.get(scenario.id);
    return entry ? [entry] : [];
  });
  const nextManifest = JSON.stringify(orderedEntries, null, 2) + '\n';
  const previousManifest = await readFile(MANIFEST_PATH, 'utf8').catch(
    error => {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }
  );

  if (previousManifest === nextManifest) {
    return;
  }

  await writeFile(MANIFEST_PATH, nextManifest, 'utf8');
}

async function captureCatalogImage(
  page: import('@playwright/test').Page,
  scenario: (typeof SCREENSHOT_SCENARIOS)[number],
  catalogPath: string
) {
  const nextPath = join(CATALOG_OUTPUT_DIR, `${scenario.id}.next.png`);

  if (scenario.captureTarget === 'locator' && scenario.captureSelector) {
    await page.locator(scenario.captureSelector).first().screenshot({
      path: nextPath,
    });
  } else {
    await page.screenshot({
      path: nextPath,
      fullPage: scenario.fullPage,
    });
  }

  const previousBuffer = await readOptionalFile(catalogPath);
  const nextBuffer = await readFile(nextPath);
  const changed = previousBuffer === null || !previousBuffer.equals(nextBuffer);

  if (changed) {
    await writeFile(catalogPath, nextBuffer);
  }

  await rm(nextPath, { force: true });
  return changed;
}

async function syncPublicExport(catalogPath: string, publicExportPath: string) {
  const exportPath = join(PUBLIC_EXPORT_DIR, publicExportPath);
  const existingExport = await readOptionalFile(exportPath);
  const catalogImage = await readFile(catalogPath);

  if (existingExport && existingExport.equals(catalogImage)) {
    return;
  }

  await copyFile(catalogPath, exportPath);
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
  await page.clock.setFixedTime(
    new Date(scenario.fixedNow ?? SCREENSHOT_CLOCK_ISO)
  );
  await page.emulateMedia({
    reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
  });
  await page.setViewportSize(viewport);
  await page.goto(scenario.route, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.NAVIGATION,
  });

  const isOpenFirstRelease =
    scenario.interaction === 'open-first-release' ||
    scenario.interaction === 'open-first-release-dsps';
  const initialWaitSelector =
    isOpenFirstRelease ? '[data-testid="releases-matrix"]' : scenario.waitFor;
  const initialWait = page.locator(initialWaitSelector).first();
  await expect(initialWait).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });

  if (isOpenFirstRelease) {
    await waitForImages(page, 'table').catch(() => {});
    await waitForSettle(page, 2000);
    await page.locator('[data-testid="release-row"]').first().click();
    await expect(page.locator(scenario.waitFor).first()).toBeVisible({
      timeout: TIMEOUTS.SIDEBAR_VISIBLE,
    });

    if (scenario.interaction === 'open-first-release-dsps') {
      const dspsTab = page.getByTestId('drawer-tab-dsps');
      await dspsTab.click();
      await waitForSettle(page);
      await expect(dspsTab).toHaveAttribute('aria-selected', 'true');
    }
  }

  await waitForImages(page).catch(() => {});
  await waitForSettle(page);
  await hideTransientUI(page);
  await assertNoDevOverlays(page);

  return scenario;
}

let manifestEntriesById = new Map<string, ScreenshotManifestEntry>();
const gitSha = process.env.GITHUB_SHA ?? null;

test.describe('Screenshot Catalog', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await ensureDirectory(CATALOG_OUTPUT_DIR);
    await ensureDirectory(PUBLIC_EXPORT_DIR);

    manifestEntriesById = await readManifestEntries();

    await removeOrphanFiles(
      CATALOG_OUTPUT_DIR,
      new Set(
        SCREENSHOT_SCENARIOS.map(scenario => `${scenario.id}.png`).concat(
          'manifest.json'
        )
      )
    );
    await removeOrphanFiles(
      PUBLIC_EXPORT_DIR,
      new Set(
        SCREENSHOT_SCENARIOS.flatMap(scenario =>
          scenario.publicExportPath ? [scenario.publicExportPath] : []
        )
      )
    );

    for (const id of [...manifestEntriesById.keys()]) {
      if (!SCREENSHOT_SCENARIOS.some(scenario => scenario.id === id)) {
        manifestEntriesById.delete(id);
      }
    }

    await writeManifest(manifestEntriesById);
  });

  for (const scenario of SCREENSHOT_SCENARIOS) {
    test(`captures ${scenario.id}`, async ({ page }) => {
      test.setTimeout(120_000);
      const previousEntry = manifestEntriesById.get(scenario.id) ?? null;
      const preparedScenario = await prepareScenario(page, scenario.id);
      const catalogPath = join(CATALOG_OUTPUT_DIR, `${scenario.id}.png`);
      const imageChanged = await captureCatalogImage(
        page,
        preparedScenario,
        catalogPath
      );

      if (preparedScenario.publicExportPath) {
        await syncPublicExport(catalogPath, preparedScenario.publicExportPath);
      }

      const nextManifestEntry: ScreenshotManifestEntry = {
        id: preparedScenario.id,
        title: preparedScenario.title,
        group: preparedScenario.group,
        groupLabel: preparedScenario.groupLabel,
        canonicalSurfaceId: preparedScenario.canonicalSurfaceId,
        canonicalSurfaceLabel: preparedScenario.canonicalSurfaceLabel,
        canonicalSurfaceReviewRoute:
          preparedScenario.canonicalSurfaceReviewRoute,
        route: preparedScenario.route,
        viewport: preparedScenario.viewport,
        theme: preparedScenario.theme,
        consumers: preparedScenario.consumers,
        capturedAt:
          !imageChanged && previousEntry
            ? previousEntry.capturedAt
            : new Date().toISOString(),
        gitSha: !imageChanged && previousEntry ? previousEntry.gitSha : gitSha,
        imagePath: `${preparedScenario.id}.png`,
        publicExportPath: preparedScenario.publicExportPath,
      };

      manifestEntriesById.set(
        preparedScenario.id,
        !imageChanged &&
          previousEntry &&
          hasSameStableManifestFields(previousEntry, nextManifestEntry)
          ? previousEntry
          : nextManifestEntry
      );

      await writeManifest(manifestEntriesById);
    });
  }
});
