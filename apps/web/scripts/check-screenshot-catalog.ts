#!/usr/bin/env tsx

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCREENSHOT_SCENARIOS } from '@/lib/screenshots/registry';

const MIB = 1024 * 1024;

export const SCREENSHOT_CATALOG_BUDGETS = {
  catalog: { maxBytes: 40 * MIB, maxFiles: 70 },
  publicExports: { maxBytes: 24 * MIB, maxFiles: 50 },
  maxImageBytes: 3 * MIB,
} as const;

interface CatalogScenario {
  readonly consumers: readonly string[];
  readonly group: string;
  readonly groupLabel: string;
  readonly id: string;
  readonly publicExportPath?: string;
  readonly route: string;
  readonly theme: string;
  readonly title: string;
  readonly viewport: string;
  readonly canonicalSurfaceId?: string;
  readonly canonicalSurfaceLabel?: string;
  readonly canonicalSurfaceReviewRoute?: string;
}

interface ManifestEntry extends CatalogScenario {
  readonly imagePath: string;
}

interface DirectoryBudget {
  readonly maxBytes: number;
  readonly maxFiles: number;
}

export interface ScreenshotCatalogBudgets {
  readonly catalog: DirectoryBudget;
  readonly publicExports: DirectoryBudget;
  readonly maxImageBytes: number;
}

export interface ScreenshotCatalogPaths {
  readonly catalogDirectory: string;
  readonly manifestPath: string;
  readonly publicExportDirectory: string;
}

export interface ScreenshotCatalogSummary {
  readonly catalogBytes: number;
  readonly catalogFiles: number;
  readonly manifestEntries: number;
  readonly publicExportBytes: number;
  readonly publicExportFiles: number;
}

export class ScreenshotCatalogIntegrityError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(
      `Screenshot catalog integrity check failed:\n- ${violations.join('\n- ')}`
    );
    this.name = 'ScreenshotCatalogIntegrityError';
  }
}

const scenarioFields = [
  'title',
  'group',
  'groupLabel',
  'canonicalSurfaceId',
  'canonicalSurfaceLabel',
  'canonicalSurfaceReviewRoute',
  'route',
  'viewport',
  'theme',
  'publicExportPath',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseManifest(value: unknown, violations: string[]): ManifestEntry[] {
  if (!Array.isArray(value)) {
    violations.push('manifest.json must contain an array');
    return [];
  }

  const entries: ManifestEntry[] = [];
  for (const [index, valueEntry] of value.entries()) {
    if (
      !isRecord(valueEntry) ||
      typeof valueEntry.id !== 'string' ||
      typeof valueEntry.imagePath !== 'string'
    ) {
      violations.push(
        `manifest entry ${index} must include string id and imagePath fields`
      );
      continue;
    }
    entries.push(valueEntry as unknown as ManifestEntry);
  }
  return entries;
}

function formatBytes(bytes: number) {
  return `${(bytes / MIB).toFixed(2)} MiB`;
}

function compareRegistryAndManifest(
  scenarios: readonly CatalogScenario[],
  entries: readonly ManifestEntry[],
  violations: string[]
) {
  const scenarioIds = scenarios.map(scenario => scenario.id);
  const manifestIds = entries.map(entry => entry.id);
  const duplicateScenarioIds = scenarioIds.filter(
    (id, index) => scenarioIds.indexOf(id) !== index
  );
  const duplicateManifestIds = manifestIds.filter(
    (id, index) => manifestIds.indexOf(id) !== index
  );

  if (duplicateScenarioIds.length > 0) {
    violations.push(
      `registry has duplicate ids: ${[...new Set(duplicateScenarioIds)].join(', ')}`
    );
  }
  if (duplicateManifestIds.length > 0) {
    violations.push(
      `manifest has duplicate ids: ${[...new Set(duplicateManifestIds)].join(', ')}`
    );
  }
  if (scenarioIds.join('\n') !== manifestIds.join('\n')) {
    violations.push(
      'manifest ids and order must exactly match SCREENSHOT_SCENARIOS'
    );
  }

  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  for (const scenario of scenarios) {
    const entry = entriesById.get(scenario.id);
    if (!entry) continue;

    if (entry.imagePath !== `${scenario.id}.png`) {
      violations.push(`${scenario.id}: imagePath must be ${scenario.id}.png`);
    }
    for (const field of scenarioFields) {
      if (entry[field] !== scenario[field]) {
        violations.push(
          `${scenario.id}: manifest ${field} does not match the registry`
        );
      }
    }
    if (
      !Array.isArray(entry.consumers) ||
      entry.consumers.join('\n') !== scenario.consumers.join('\n')
    ) {
      violations.push(
        `${scenario.id}: manifest consumers do not match the registry`
      );
    }
  }
}

async function inspectDirectory(
  directory: string,
  expectedFiles: ReadonlySet<string>,
  budget: DirectoryBudget,
  maxImageBytes: number,
  label: string,
  violations: string[]
) {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const actualFiles = directoryEntries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      violations.push(`${label} contains non-file entry: ${entry.name}`);
    }
  }
  for (const file of actualFiles) {
    if (!expectedFiles.has(file)) {
      violations.push(`${label} contains orphan or temporary file: ${file}`);
    }
  }
  for (const file of expectedFiles) {
    if (!actualFiles.includes(file)) {
      violations.push(`${label} is missing expected file: ${file}`);
    }
  }

  const imageFiles = actualFiles.filter(file => extname(file) === '.png');
  let totalBytes = 0;
  for (const file of imageFiles) {
    const fileBytes = (await stat(join(directory, file))).size;
    totalBytes += fileBytes;
    if (fileBytes > maxImageBytes) {
      violations.push(
        `${label}/${file} is ${formatBytes(fileBytes)}, over the ${formatBytes(maxImageBytes)} per-image budget`
      );
    }
  }

  if (imageFiles.length > budget.maxFiles) {
    violations.push(
      `${label} has ${imageFiles.length} images, over the ${budget.maxFiles}-image budget`
    );
  }
  if (totalBytes > budget.maxBytes) {
    violations.push(
      `${label} uses ${formatBytes(totalBytes)}, over the ${formatBytes(budget.maxBytes)} budget`
    );
  }

  return { bytes: totalBytes, files: imageFiles.length };
}

export async function checkScreenshotCatalog({
  budgets = SCREENSHOT_CATALOG_BUDGETS,
  paths,
  scenarios = SCREENSHOT_SCENARIOS,
}: {
  readonly budgets?: ScreenshotCatalogBudgets;
  readonly paths: ScreenshotCatalogPaths;
  readonly scenarios?: readonly CatalogScenario[];
}): Promise<ScreenshotCatalogSummary> {
  const violations: string[] = [];
  const manifestValue = JSON.parse(
    await readFile(paths.manifestPath, 'utf8')
  ) as unknown;
  const entries = parseManifest(manifestValue, violations);

  compareRegistryAndManifest(scenarios, entries, violations);

  const catalogFiles = new Set([
    'manifest.json',
    ...entries.map(entry => entry.imagePath),
  ]);
  const publicExportFiles = new Set(
    entries.flatMap(entry =>
      entry.publicExportPath ? [entry.publicExportPath] : []
    )
  );
  const catalog = await inspectDirectory(
    paths.catalogDirectory,
    catalogFiles,
    budgets.catalog,
    budgets.maxImageBytes,
    'screenshot-catalog/current',
    violations
  );
  const publicExports = await inspectDirectory(
    paths.publicExportDirectory,
    publicExportFiles,
    budgets.publicExports,
    budgets.maxImageBytes,
    'public/product-screenshots',
    violations
  );

  for (const entry of entries) {
    if (!entry.publicExportPath) continue;
    const catalogImage = await readFile(
      join(paths.catalogDirectory, entry.imagePath)
    ).catch(() => null);
    const publicImage = await readFile(
      join(paths.publicExportDirectory, entry.publicExportPath)
    ).catch(() => null);
    if (catalogImage && publicImage && !catalogImage.equals(publicImage)) {
      violations.push(
        `${entry.id}: public export does not match its canonical catalog image`
      );
    }
  }

  if (violations.length > 0) {
    throw new ScreenshotCatalogIntegrityError(violations);
  }

  return {
    catalogBytes: catalog.bytes,
    catalogFiles: catalog.files,
    manifestEntries: entries.length,
    publicExportBytes: publicExports.bytes,
    publicExportFiles: publicExports.files,
  };
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDirectory, '..');

async function main() {
  const summary = await checkScreenshotCatalog({
    paths: {
      catalogDirectory: join(webRoot, 'screenshot-catalog/current'),
      manifestPath: join(webRoot, 'screenshot-catalog/current/manifest.json'),
      publicExportDirectory: join(webRoot, 'public/product-screenshots'),
    },
  });

  process.stdout.write(
    `[screenshot-catalog] PASS: ${summary.catalogFiles}/${SCREENSHOT_CATALOG_BUDGETS.catalog.maxFiles} catalog images (${formatBytes(summary.catalogBytes)}/${formatBytes(SCREENSHOT_CATALOG_BUDGETS.catalog.maxBytes)}), ${summary.publicExportFiles}/${SCREENSHOT_CATALOG_BUDGETS.publicExports.maxFiles} public exports (${formatBytes(summary.publicExportBytes)}/${formatBytes(SCREENSHOT_CATALOG_BUDGETS.publicExports.maxBytes)}).\n`
  );
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  void main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
