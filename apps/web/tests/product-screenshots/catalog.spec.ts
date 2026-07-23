import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import {
  getScreenshotScenario,
  SCREENSHOT_SCENARIOS,
  SCREENSHOT_VIEWPORTS,
} from '../../lib/screenshots/registry';
import {
  isScreenshotManifestEntry,
  type ScreenshotManifestEntry,
} from '../../lib/screenshots/types';
import { pruneFixedOwnedOutputFiles } from '../../scripts/owned-output-path';
import { replaceWithAtomicSibling } from './atomic-output';
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

// Force DESIGN_V1 (and its SHELL_CHAT_V1 alias) on for every catalog scenario.
// The override slot for both flag names is `code:DESIGN_V1`, so a single entry
// covers the entire New Design surface. We pin this explicitly so a future
// change to APP_FLAG_DEFAULTS or the Statsig gate cannot silently flip
// marketing/product screenshots back to the legacy shell.
const SCREENSHOT_FLAG_OVERRIDES = JSON.stringify({
  [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
});

const MANIFEST_PATH = join(CATALOG_OUTPUT_DIR, 'manifest.json');

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

  await replaceWithAtomicSibling(MANIFEST_PATH, async temporaryPath => {
    await writeFile(temporaryPath, nextManifest, 'utf8');
    return true;
  });
}

async function captureCatalogImage(
  page: import('@playwright/test').Page,
  scenario: (typeof SCREENSHOT_SCENARIOS)[number],
  catalogPath: string
) {
  return replaceWithAtomicSibling(catalogPath, async nextPath => {
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
    return previousBuffer === null || !previousBuffer.equals(nextBuffer);
  });
}

async function syncPublicExport(catalogPath: string, publicExportPath: string) {
  const exportPath = join(PUBLIC_EXPORT_DIR, publicExportPath);
  const existingExport = await readOptionalFile(exportPath);
  const catalogImage = await readFile(catalogPath);

  if (existingExport && existingExport.equals(catalogImage)) {
    return;
  }

  await replaceWithAtomicSibling(exportPath, async temporaryPath => {
    await copyFile(catalogPath, temporaryPath);
    return true;
  });
}

async function assertNoShellInternalChrome(
  page: import('@playwright/test').Page,
  scenario: (typeof SCREENSHOT_SCENARIOS)[number]
) {
  if (
    !scenario.id.startsWith('shell-v1-') ||
    !scenario.consumers.includes('marketing-export')
  ) {
    return;
  }

  await expect(
    page.locator('.shell-v1 aside').getByText('Admin', { exact: true })
  ).toHaveCount(0);
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
  // shell-v1 scenarios use deterministic demo dates internally, and mocking
  // the browser clock can interfere with loader animation timers.
  if (!scenario.id.startsWith('shell-v1-')) {
    await page.clock.setFixedTime(
      new Date(scenario.fixedNow ?? SCREENSHOT_CLOCK_ISO)
    );
  }
  await page.emulateMedia({
    reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
  });
  await page.setViewportSize(viewport);
  await page.addInitScript(
    ({ cookieName, key, value }) => {
      localStorage.setItem(key, value);
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    },
    {
      cookieName: APP_FLAG_OVERRIDES_COOKIE,
      key: FF_OVERRIDES_KEY,
      value: SCREENSHOT_FLAG_OVERRIDES,
    }
  );
  await page.goto(scenario.route, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.NAVIGATION,
  });

  const isOpenFirstRelease =
    scenario.interaction === 'open-first-release' ||
    scenario.interaction === 'open-first-release-dsps';
  const initialWaitSelector = isOpenFirstRelease
    ? '[data-testid="releases-matrix"]'
    : scenario.waitFor;
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

  if (
    scenario.interaction === 'open-shell-library' ||
    scenario.interaction === 'open-shell-releases'
  ) {
    await waitForSettle(page, 250);
  }

  await assertNoShellInternalChrome(page, scenario);

  if (scenario.interaction === 'open-shell-library') {
    await expect(page.getByText('All assets').first()).toBeVisible({
      timeout: TIMEOUTS.CONTENT_VISIBLE,
    });
    await expect(page.getByText('The Deep End — album art')).toBeVisible();
    await expect(page.getByText('Take Me Over').first()).toBeVisible();
    await expect(
      page.getByText('Tim White press photo 03', { exact: true })
    ).toBeVisible();
  }

  if (scenario.interaction === 'open-shell-releases') {
    await expect(page.getByText('The Deep End').first()).toBeVisible({
      timeout: TIMEOUTS.CONTENT_VISIBLE,
    });
    await expect(
      page.getByText('Cosmic Gate & Tim White').first()
    ).toBeVisible();
    await expect(page.getByText('Take Me Over').first()).toBeVisible();
    await expect(page.getByTestId('shell-v1-picking-up')).toHaveCount(1);
    await expect(page.getByTestId('shell-v1-release-drawer')).toHaveCount(0);
  }

  if (scenario.id === 'release-presave-mobile') {
    await expect(
      page.getByRole('heading', { name: 'The Deep End' })
    ).toBeVisible({
      timeout: TIMEOUTS.CONTENT_VISIBLE,
    });
    await expect(page.getByText('Cosmic Gate & Tim White')).toBeVisible();
    await expect(page.getByAltText('The Deep End artwork')).toBeVisible();
    await expect(page.getByText('Listen everywhere')).toBeVisible();
    await expect(page.getByText('Spotify')).toBeVisible();
    await expect(page.getByText('Amazon Music')).toBeVisible();
    await expect(page.getByTestId('smart-link-brand-mark')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'More options' })
    ).toHaveCount(0);
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
    await pruneFixedOwnedOutputFiles(
      dirname(CATALOG_OUTPUT_DIR),
      'current',
      CATALOG_OUTPUT_DIR,
      'SCREENSHOT_CATALOG_OUTPUT_DIR',
      new Set(
        SCREENSHOT_SCENARIOS.map(scenario => `${scenario.id}.png`).concat(
          'manifest.json'
        )
      )
    );
    await pruneFixedOwnedOutputFiles(
      dirname(PUBLIC_EXPORT_DIR),
      'product-screenshots',
      PUBLIC_EXPORT_DIR,
      'PUBLIC_SCREENSHOT_EXPORT_DIR',
      new Set(
        SCREENSHOT_SCENARIOS.flatMap(scenario =>
          scenario.publicExportPath ? [scenario.publicExportPath] : []
        )
      )
    );

    manifestEntriesById = await readManifestEntries();

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
