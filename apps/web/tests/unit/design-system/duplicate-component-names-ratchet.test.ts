import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Duplicate component ratchet.
 *
 * Two component files with the same basename in different folders are the
 * usual first sign of a forked primitive (AuthShell, StatusBadge, ...). The
 * set of known duplicate names is frozen in
 * duplicate-component-names.baseline.json. A NEW duplicate name fails; when a
 * duplicate is consolidated, remove it from the baseline in the same PR.
 * Re-export shims count as duplicates only if they are real component files.
 *
 * Regenerate: UPDATE_DUPLICATE_COMPONENTS=1 pnpm --filter web exec vitest run \
 *   tests/unit/design-system/duplicate-component-names-ratchet.test.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const UI_ROOT = join(WEB_ROOT, '..', '..', 'packages', 'ui');
const SCAN_DIRS = [join(WEB_ROOT, 'components'), UI_ROOT];
const BASELINE_PATH = join(
  __dirname,
  'duplicate-component-names.baseline.json'
);
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage']);
const COMPONENT_FILE = /^[A-Z][A-Za-z0-9]*\.tsx$/;
const NOT_COMPONENT = /\.(test|spec|stories)\.tsx$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(full, out);
    } else if (
      COMPONENT_FILE.test(entry.name) &&
      !NOT_COMPONENT.test(entry.name)
    ) {
      out.push(full);
    }
  }
}

function duplicateNames(): Record<string, string[]> {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = file.slice(file.lastIndexOf('/') + 1, -'.tsx'.length);
    const rel = relative(join(WEB_ROOT, '..', '..'), file);
    byName.set(name, [...(byName.get(name) ?? []), rel]);
  }
  return Object.fromEntries(
    [...byName]
      .filter(([, paths]) => paths.length > 1)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, paths]) => [name, paths.sort()])
  );
}

describe('duplicate component names ratchet', () => {
  it('has no component basename duplicated beyond the frozen baseline', () => {
    const current = duplicateNames();
    if (process.env.UPDATE_DUPLICATE_COMPONENTS === '1') {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ duplicates: current }, null, 2)}\n`
      );
    }
    const baseline: { duplicates: Record<string, string[]> } = JSON.parse(
      readFileSync(BASELINE_PATH, 'utf8')
    );
    const added = Object.keys(current).filter(
      name => !(name in baseline.duplicates)
    );
    expect(
      added,
      `New duplicate component name(s): ${added
        .map(name => `${name} -> ${current[name]?.join(', ')}`)
        .join('; ')}. Reuse the existing component or give it a distinct name.`
    ).toEqual([]);
    const stale = Object.keys(baseline.duplicates).filter(
      name => !(name in current)
    );
    expect(
      stale,
      `Consolidated: remove ${stale.join(', ')} from duplicate-component-names.baseline.json`
    ).toEqual([]);
  });
});
