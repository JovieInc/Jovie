/**
 * Local-only scoping for `pnpm preflight:changed` (never changes CI).
 *
 * Required CI checks stay exactly as they are; this only decides what runs
 * before a push and how the result is reported:
 *  - NARROWED_LOCAL: a guard whose whole-suite command is swapped for the
 *    change-derived subset locally; the rest is reported "deferred to CI".
 *  - unrelatedFailure: a guard that failed only in test files the change
 *    cannot reach (not changed, not importing a changed file) is reported
 *    as a warning, not a local red. CI is still the authority.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { testsAffectedBy } from './test-file-dependencies.mjs';

/** Guards narrowed to the change-derived subset locally. */
export const NARROWED_LOCAL = Object.freeze({
  'script-contracts': {
    command: 'node scripts/lib/script-contract-affected.mjs --derived-only',
    note: 'contracts whose files or direct importers changed; full list deferred to CI',
    deferredToCi:
      'script-contracts full list (CI structural lane runs every contract)',
  },
});

/** Resolve a failed-test path as printed by a runner to a repo file, or null. */
export function resolveTestPath(failed, root) {
  for (const candidate of [failed, `scripts/${failed}`, `apps/web/${failed}`])
    if (existsSync(path.join(root, candidate))) return candidate;
  return null;
}

/**
 * True when every failed test is provably unrelated to the change: the test
 * file itself is untouched and none of its (transitive) dependencies changed.
 * Fails closed: no named tests, or an unresolvable test, is related.
 *
 * @param {string[]} failedTests
 * @param {string[]} changedPaths
 * @param {string} root
 */
export function unrelatedFailure(failedTests, changedPaths, root) {
  if (!failedTests?.length) return false;
  const changed = new Set(changedPaths);
  return failedTests.every(failed => {
    const file = resolveTestPath(failed, root);
    if (!file || changed.has(file)) return false;
    return testsAffectedBy([file], changedPaths, root).length === 0;
  });
}
