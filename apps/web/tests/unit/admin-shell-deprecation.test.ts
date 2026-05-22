/**
 * Admin shell deprecation ratchet (JOV-2525).
 *
 * `AdminToolPage` and `AdminWorkspacePage` are `@deprecated` shims that
 * re-export the canonical `AdminPage`. They exist only so the ~20 admin pages
 * that still import them can continue to render while they migrate.
 *
 * This test enforces that the importer count of the deprecated wrappers
 * monotonically decreases. Each follow-up Linear issue that migrates a route
 * is required to decrement `MAX_DEPRECATED_IMPORTERS` by one. When the count
 * reaches zero, both shim files can be deleted.
 *
 * If this test fails because the count went UP, you added a new import of
 * `AdminToolPage`/`AdminWorkspacePage`. Don't. Use `AdminPage` directly:
 *
 *   import { AdminPage } from '@/components/features/admin/layout/AdminPage';
 *
 * If this test fails because the count went DOWN (because you successfully
 * migrated a route), great — decrement `MAX_DEPRECATED_IMPORTERS` in this
 * file as part of the same PR.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APPS_WEB_ROOT = resolve(__dirname, '../..');

// Files that ARE the deprecated wrappers themselves — they reference their own
// names and obviously don't count as importers.
const SELF_REFERENCING = new Set([
  resolve(APPS_WEB_ROOT, 'components/features/admin/layout/AdminToolPage.tsx'),
  resolve(
    APPS_WEB_ROOT,
    'components/features/admin/layout/AdminWorkspacePage.tsx'
  ),
]);

// Skip directories that aren't worth walking — keeps the test fast and avoids
// false positives from generated artifacts or third-party code.
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.git',
]);

// Match actual ES module imports of the deprecated wrappers. Matches both
// named imports (`import { AdminToolPage }`) and renamed imports
// (`import { AdminToolPage as X }`). Plain mentions in comments, JSDoc, or
// test assertions don't count — those names appear deliberately in this very
// test file, in shell-normalization specs that lock in the deprecated usage,
// and in the canonical `AdminPage.tsx` JSDoc.
const DEPRECATED_IMPORT_PATTERN =
  /import\s*(?:type\s+)?\{[^}]*\b(?:AdminToolPage|AdminWorkspacePage)\b[^}]*\}\s*from/;

function walk(dir: string, results: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      walk(full, results);
    } else if (
      stats.isFile() &&
      (entry.endsWith('.ts') || entry.endsWith('.tsx'))
    ) {
      results.push(full);
    }
  }
}

function countImporters(): { files: string[]; count: number } {
  const all: string[] = [];
  walk(APPS_WEB_ROOT, all);

  const importers: string[] = [];
  for (const file of all) {
    if (SELF_REFERENCING.has(file)) continue;
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (DEPRECATED_IMPORT_PATTERN.test(source)) {
      importers.push(file);
    }
  }
  return { files: importers, count: importers.length };
}

/**
 * RATCHET — only ever decrement this value.
 *
 * Update the date and Linear issue ID when you decrement. Current ceiling
 * lowered by JOV-2544 on 2026-05-21: 6 importers remain after migrating
 * simple `AdminToolPage` callers to `AdminPage` directly.
 */
const MAX_DEPRECATED_IMPORTERS = 6;

describe('admin shell deprecation ratchet', () => {
  it(`has at most ${MAX_DEPRECATED_IMPORTERS} importers of AdminToolPage/AdminWorkspacePage`, () => {
    const { files, count } = countImporters();
    if (count > MAX_DEPRECATED_IMPORTERS) {
      throw new Error(
        `Importer count went UP. Found ${count} importers (ceiling: ${MAX_DEPRECATED_IMPORTERS}). ` +
          `Use AdminPage from '@/components/features/admin/layout/AdminPage' for new admin pages. ` +
          `Importers:\n${files.map(f => `  - ${f.replace(`${APPS_WEB_ROOT}/`, '')}`).join('\n')}`
      );
    }
    expect(count).toBeLessThanOrEqual(MAX_DEPRECATED_IMPORTERS);
  });

  it('reminds maintainers to decrement the ratchet when migrations land', () => {
    const { count } = countImporters();
    // If the count has dropped below the ceiling, the ratchet is stale.
    // Decrement MAX_DEPRECATED_IMPORTERS in the same PR that migrated the
    // route.
    expect(count).toBeGreaterThanOrEqual(
      Math.max(0, MAX_DEPRECATED_IMPORTERS - 4),
      `Ratchet ceiling (${MAX_DEPRECATED_IMPORTERS}) is more than 4 ahead of actual ` +
        `count (${count}). Decrement MAX_DEPRECATED_IMPORTERS in admin-shell-deprecation.test.ts.`
    );
  });
});
