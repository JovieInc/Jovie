import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatScreenshotCatalogManifest } from './format-screenshot-catalog-manifest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const MANIFEST_PATH = join(
  REPO_ROOT,
  'apps/web/screenshot-catalog/current/manifest.json'
);

describe('formatScreenshotCatalogManifest', () => {
  it('keeps short consumers arrays on one line', () => {
    const formatted = formatScreenshotCatalogManifest([
      {
        id: 'marketing-home-desktop',
        title: 'Artist Spec — Audience Quality',
        consumers: ['admin', 'marketing-export', 'investor-ready'],
      },
    ]);

    expect(formatted).toContain(
      '"consumers": ["admin", "marketing-export", "investor-ready"]'
    );
    expect(formatted).not.toMatch(/"consumers": \[\n/);
    expect(formatted).toContain('Artist Spec — Audience Quality');
    expect(formatted.endsWith('\n')).toBe(true);
  });

  it('matches the committed catalog so a clean manifest is not rewritten', () => {
    const committed = readFileSync(MANIFEST_PATH, 'utf8');
    expect(formatScreenshotCatalogManifest(JSON.parse(committed))).toBe(
      committed
    );
  });

  it('is what the catalog writer uses', () => {
    const writer = readFileSync(
      join(REPO_ROOT, 'apps/web/tests/product-screenshots/catalog.spec.ts'),
      'utf8'
    );
    expect(writer).toContain('formatScreenshotCatalogManifest(orderedEntries)');
    expect(writer).not.toContain('JSON.stringify(orderedEntries, null, 2)');
  });

  it('stays free of import.meta so Playwright can load it as CommonJS', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'apps/web/scripts/format-screenshot-catalog-manifest.ts'),
      'utf8'
    );
    const executable = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(executable).not.toContain('import.meta');
    expect(executable).not.toContain('fileURLToPath');
  });
});
