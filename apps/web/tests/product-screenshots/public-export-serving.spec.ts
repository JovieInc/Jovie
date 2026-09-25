import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { SCREENSHOT_SCENARIOS } from '../../lib/screenshots/registry';
import {
  isScreenshotManifestEntry,
  type ScreenshotManifestEntry,
} from '../../lib/screenshots/types';
import { CATALOG_OUTPUT_DIR } from './helpers';

const manifestPath = join(CATALOG_OUTPUT_DIR, 'manifest.json');
const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

test.skip(
  process.env.SCREENSHOT_BUILD_MODE !== 'production',
  'Requires the production screenshot build server'
);

test('production build serves every public screenshot export from catalog bytes', async ({
  request,
}) => {
  test.setTimeout(120_000);
  expect(process.env.SCREENSHOT_BUILD_MODE).toBe('production');
  expect(process.env.BASE_URL).toBe('http://localhost:3000');

  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  expect(Array.isArray(parsed)).toBe(true);
  const manifestRows = parsed as unknown[];
  const entries = manifestRows.filter(isScreenshotManifestEntry);
  expect(entries).toHaveLength(manifestRows.length);
  const exports = entries.filter(
    (entry): entry is ScreenshotManifestEntry & { publicExportPath: string } =>
      Boolean(entry.publicExportPath)
  );
  const registeredExports = SCREENSHOT_SCENARIOS.flatMap(scenario =>
    scenario.publicExportPath
      ? [`${scenario.id}:${scenario.publicExportPath}`]
      : []
  );
  const manifestExports = exports.map(
    entry => `${entry.id}:${entry.publicExportPath}`
  );
  const sortedRegisteredExports = [...registeredExports].sort();
  const sortedManifestExports = [...manifestExports].sort();

  expect(sortedRegisteredExports.length).toBeGreaterThan(0);
  expect(new Set(sortedRegisteredExports).size).toBe(
    sortedRegisteredExports.length
  );
  expect(new Set(sortedManifestExports).size).toBe(
    sortedManifestExports.length
  );
  expect(sortedManifestExports).toEqual(sortedRegisteredExports);

  for (const entry of exports) {
    const canonicalBytes = await readFile(
      join(CATALOG_OUTPUT_DIR, entry.imagePath)
    );
    const response = await request.get(
      `/product-screenshots/${encodeURIComponent(entry.publicExportPath)}`
    );

    expect(response.status(), `${entry.id} public export status`).toBe(200);
    expect(
      response.headers()['content-type'],
      `${entry.id} public export content type`
    ).toContain('image/png');
    expect(
      sha256(await response.body()),
      `${entry.id} public export SHA-256`
    ).toBe(sha256(canonicalBytes));
  }
});
