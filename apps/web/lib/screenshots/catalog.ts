import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureWarning } from '@/lib/error-tracking';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import {
  getScreenshotScenario,
  SCREENSHOT_SCENARIO_IDS,
  SCREENSHOT_SCENARIOS,
} from './registry';
import type { ScreenshotCatalogEntry, ScreenshotManifestEntry } from './types';

const CATALOG_ROOT = resolveMonorepoPath(
  'apps',
  'web',
  'screenshot-catalog',
  'current'
);
const PUBLIC_EXPORT_ROOT = resolveMonorepoPath(
  'apps',
  'web',
  'public',
  'product-screenshots'
);
const MANIFEST_PATH = join(CATALOG_ROOT, 'manifest.json');

function getCatalogImagePath(id: string) {
  return join(CATALOG_ROOT, `${id}.png`);
}

function getPublicExportAbsolutePath(relativePath: string) {
  return join(PUBLIC_EXPORT_ROOT, relativePath);
}

function isScreenshotManifestEntry(
  value: unknown
): value is ScreenshotManifestEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<ScreenshotManifestEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.group === 'string' &&
    typeof entry.groupLabel === 'string' &&
    typeof entry.route === 'string' &&
    typeof entry.viewport === 'string' &&
    typeof entry.theme === 'string' &&
    Array.isArray(entry.consumers) &&
    typeof entry.capturedAt === 'string' &&
    typeof entry.imagePath === 'string' &&
    (typeof entry.gitSha === 'string' || entry.gitSha === null) &&
    (typeof entry.publicExportPath === 'string' ||
      typeof entry.publicExportPath === 'undefined')
  );
}

async function readManifest(): Promise<readonly ScreenshotManifestEntry[]> {
  try {
    const manifestContents = await readFile(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(manifestContents);
    if (!Array.isArray(parsed)) {
      void captureWarning('Screenshot catalog manifest is not an array', null);
      return [];
    }
    return parsed.filter(
      (entry): entry is ScreenshotManifestEntry =>
        isScreenshotManifestEntry(entry) &&
        SCREENSHOT_SCENARIO_IDS.has(entry.id)
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    void captureWarning('Unable to read screenshot catalog manifest', error);
    return [];
  }
}

async function statFile(path: string): Promise<number | null> {
  try {
    const fileStat = await stat(path);
    return fileStat.size;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    void captureWarning('Unable to stat screenshot file', error, { path });
    return null;
  }
}

async function buildFallbackEntries(): Promise<
  readonly ScreenshotCatalogEntry[]
> {
  const entries: ScreenshotCatalogEntry[] = [];

  for (const scenario of SCREENSHOT_SCENARIOS) {
    const imagePath = getCatalogImagePath(scenario.id);
    const sizeBytes = await statFile(imagePath);
    if (sizeBytes === null) continue;

    entries.push({
      id: scenario.id,
      title: scenario.title,
      group: scenario.group,
      groupLabel: scenario.groupLabel,
      route: scenario.route,
      viewport: scenario.viewport,
      theme: scenario.theme,
      consumers: scenario.consumers,
      capturedAt: '',
      gitSha: null,
      imagePath: `${scenario.id}.png`,
      publicExportPath: scenario.publicExportPath,
      sizeBytes,
      url: `/api/admin/screenshots/${encodeURIComponent(scenario.id)}`,
      publicUrl: scenario.publicExportPath
        ? `/product-screenshots/${scenario.publicExportPath}`
        : undefined,
    });
  }

  return entries;
}

export async function getScreenshotCatalog(): Promise<
  readonly ScreenshotCatalogEntry[]
> {
  const manifestEntries = await readManifest();
  if (manifestEntries.length === 0) {
    return buildFallbackEntries();
  }

  const entries: ScreenshotCatalogEntry[] = [];
  for (const manifestEntry of manifestEntries) {
    const scenario = getScreenshotScenario(manifestEntry.id);
    if (!scenario) continue;

    const imagePath = getCatalogImagePath(manifestEntry.id);
    const sizeBytes = await statFile(imagePath);
    if (sizeBytes === null) continue;

    entries.push({
      ...manifestEntry,
      groupLabel: scenario.groupLabel,
      consumers: scenario.consumers,
      sizeBytes,
      url: `/api/admin/screenshots/${encodeURIComponent(manifestEntry.id)}`,
      publicUrl: manifestEntry.publicExportPath
        ? `/product-screenshots/${manifestEntry.publicExportPath}`
        : undefined,
    });
  }

  return entries;
}

export function resolveCatalogScreenshotPath(id: string): string | null {
  if (!SCREENSHOT_SCENARIO_IDS.has(id)) return null;
  return getCatalogImagePath(id);
}

export function getCatalogManifestPath() {
  return MANIFEST_PATH;
}

export function getCatalogRootPath() {
  return CATALOG_ROOT;
}

export function getPublicExportRootPath() {
  return PUBLIC_EXPORT_ROOT;
}

export function resolvePublicExportPath(relativePath: string): string {
  return getPublicExportAbsolutePath(relativePath);
}
