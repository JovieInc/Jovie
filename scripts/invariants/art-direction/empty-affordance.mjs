/**
 * An affordance promises something behind it. A disclosure caret, a flyout
 * trigger or a count badge that renders while its children or count are
 * empty is a lie (the Customers menu showing a down arrow over one link).
 *
 * Static heuristic over apps/web/components, shrink-only baseline:
 *  - caret-unguarded: a file draws a disclosure caret (Chevron or Caret icon)
 *    on an aria-expanded trigger and maps a collection, with no emptiness
 *    guard anywhere in the file.
 *  - badge-zero: a count badge gated only on "!== undefined" renders a 0.
 * Preferred fix: derive the caret from non-empty children by type (see
 * apps/web/components/organisms/headerNavEntries.ts), not from a flag.
 * A guard is any of GUARD below; "// affordance-guarded: <reason>" on a line
 * of the file also counts, for a collection that is non-empty by contract.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './paths.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';

export const EMPTY_AFFORDANCE_BASELINE =
  'scripts/invariants/art-direction/empty-affordance.baseline.json';
const ROOT = 'apps/web/components';
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage']);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
const CARET = /<(?:Chevron(?:Down|Right|Up)|Caret(?:Down|Right|Up))\b/;
const EXPANDABLE = /aria-expanded|aria-haspopup|DropdownMenuTrigger/;
const COLLECTION = /\.map\(/;
const GUARD =
  /\.length\s*(?:[<>=!]=?=?|\?|&&|\|\|)|\.length\)|!\w+(?:\.\w+)*\.length\b|\bitemCount\b|\bhasItems\b|\bhasMenu\b|\bisEmpty\b|toHeaderNavEntr|affordance-guarded:/;
const BADGE_UNGUARDED = /\.badge\s*!==\s*undefined\s*&&\s*<\s*\w*Badge\b/;

export function affordanceViolations(source, file) {
  const ids = [];
  if (
    CARET.test(source) &&
    EXPANDABLE.test(source) &&
    COLLECTION.test(source) &&
    !GUARD.test(source)
  ) {
    ids.push(`caret-unguarded:${file}`);
  }
  if (BADGE_UNGUARDED.test(source)) ids.push(`badge-zero:${file}`);
  return ids;
}

function walk(repoRoot) {
  const files = [];
  const visit = absolute => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isFile()) {
      if (/\.tsx$/.test(absolute) && !SKIP_FILE.test(absolute))
        files.push(absolute);
      return;
    }
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(absolute)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      visit(join(absolute, entry));
    }
  };
  visit(join(repoRoot, ROOT));
  return files;
}

export function scanEmptyAffordance(repoRoot = REPO_ROOT) {
  const ids = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    ids.push(...affordanceViolations(readFileSync(file, 'utf8'), rel));
  }
  return ids.sort();
}

export function check(repoRoot = REPO_ROOT, recordedIds) {
  const current = scanEmptyAffordance(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, EMPTY_AFFORDANCE_BASELINE), 'utf8'))
      .ids;
  const ancestor = ancestorJson(repoRoot, EMPTY_AFFORDANCE_BASELINE);
  if (!ancestor.ok) return { failures: [ancestor.error], ids: current };
  return {
    failures: evaluateRatchet({
      current,
      recorded,
      ancestor: ancestor.ancestor?.ids ?? null,
    }),
    ids: current,
  };
}
