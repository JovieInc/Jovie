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
import { cpus, homedir, loadavg } from 'node:os';
import path from 'node:path';
import { acquireSlot, defaultLockDir } from './preflight-lock.mjs';
import { recordTimings } from './preflight-timing.mjs';
import { isInfraTimeout } from './prepush-offload.mjs';
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
    // The dependency scan follows JS modules only; a TS test is always related.
    if (!file || changed.has(file) || !/\.(?:mjs|cjs|js)$/.test(file))
      return false;
    return testsAffectedBy([file], changedPaths, root).length === 0;
  });
}

/** Every failing item, numbered; never a count with the items cut off. */
export function failingItemLines({ red, body, companion }) {
  const items = [
    ...red.map(r => `${r.name} [${r.id}]`),
    ...body.errors.map(e => `PR body: ${e.message}`),
    ...companion.map(c => `companion edit (${c.trigger}): ${c.item}`),
  ];
  if (!items.length) return [];
  return [
    `\nFailing items (${items.length}):`,
    ...items.map((item, i) => `  ${i + 1}. ${item}`),
  ];
}

/** The last line; a skipped check is named, never folded into "all clear". */
export function verdictLine(total, results = []) {
  const skips = results.filter(r => r.skip).map(r => r.name);
  const tail = skips.length
    ? `; SKIPPED here (CI runs): ${skips.join(', ')}`
    : '';
  return total
    ? `\n${total} item(s) to fix before pushing${tail}.`
    : `\nall clear${tail}.`;
}

/** Load high enough that a local red may be noise (override JOVIE_PREFLIGHT_OVERLOAD_FACTOR). */
export function hostOverloaded(
  env = process.env,
  load = loadavg()[0],
  cores = cpus().length
) {
  if (env.CI || env.GEM_TYPECHECK_SLOTS) return false;
  return load > cores * (Number(env.JOVIE_PREFLIGHT_OVERLOAD_FACTOR) || 2);
}

/** One heavy preflight per host; Gem has its own semaphore, tests set LEDGER=off. */
export async function takeSlot({ args, env, cwd, log, sha }) {
  if (
    !args.lock ||
    env.GEM_TYPECHECK_SLOTS ||
    env.CI ||
    env.JOVIE_PREFLIGHT_LEDGER === 'off'
  )
    return { release() {}, waitedMs: 0 };
  return acquireSlot({
    dir: defaultLockDir(env),
    slots: Number(env.JOVIE_PREFLIGHT_LOCAL_SLOTS || 1),
    label: `${path.basename(cwd)}@${sha}`,
    log,
  });
}

/**
 * Decide whether a red is a verdict on this change.
 *  - Under host overload a timeout is inconclusive; any other red is rerun once.
 *  - A guard that failed only in tests the change cannot reach is a warning.
 * CI stays the authority for both.
 */
export async function settleResult(c, first, { env, paths, cwd }) {
  let r = first;
  if (r.code && hostOverloaded(env)) {
    const load = loadavg()[0].toFixed(0);
    if (r.code === 124 || isInfraTimeout(r))
      r = {
        ...r,
        code: 0,
        warn: `${c.name} timed out or was killed under host load ${load}; inconclusive, not an item to fix. Run \`pnpm preflight:remote\` or let CI decide`,
      };
    else {
      const again = await c.run();
      r = again.code
        ? again
        : {
            ...again,
            warn: `${c.name} failed once under host load ${load} and passed on rerun; treat as load noise`,
          };
    }
  }
  if (
    r.code &&
    /^guard:/.test(c.id) &&
    unrelatedFailure(r.failedTests, paths, cwd)
  )
    r = {
      ...r,
      code: 0,
      warn: `${c.name} failed only in tests this change does not touch (${r.failedTests.join(', ')}); not blocking the push, CI decides`,
    };
  return r;
}

/** Per-guard timings + stage event for this run. */
export function recordRun({
  dir,
  args,
  cwd,
  env,
  head,
  paths,
  runStarted,
  slot,
  total,
  results,
  deferred,
}) {
  return recordTimings({
    dir,
    file: args.timingsFile,
    run: {
      head,
      host: env.HOSTNAME || path.basename(homedir()),
      files: paths.length,
      totalMs: Date.now() - runStarted,
      waitedMs: slot.waitedMs,
      outcome: total ? 'failed' : 'completed',
      guards: results.map(r => ({ id: r.id, ms: r.ms ?? 0, status: r.status })),
      deferred,
    },
  });
}
