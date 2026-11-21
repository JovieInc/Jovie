import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import {
  listAllChangedFiles,
  packageScripts,
  runCommandPool,
  selectSourceGuards,
  shellAsync,
  structuralLocks,
} from '../ci-fast-lanes.mjs';
import { commandLabel } from './ci-failure-excerpts.mjs';
import {
  MERGED_WITH_BASE_POOL_CONCURRENCY,
  MERGED_WITH_BASE_POOL_LONG_POLES,
} from './merged-with-base-pool-config.mjs';

/**
 * Expand a pool spec into runnable entries. A `splitChain` entry becomes one
 * entry per top-level `&&` segment of the named pnpm script, read from the
 * package.json of the current directory (the merged worktree when the guard
 * runs). Every segment still runs and any failure fails — segment-level
 * fail-closed, like the old `set -e` chain. If the script is missing the
 * whole chain runs as one entry: same commands, never fewer.
 * @param {{commands: readonly {id: string, command: string, splitChain?: boolean}[], concurrency?: number}} spec
 * @param {Record<string, string>} [scripts] defaults to package.json scripts in cwd
 * @returns {{id: string, command: string}[]}
 */
export function expandSourcePoolEntries(spec, scripts = packageScripts('.')) {
  return spec.commands.flatMap(entry => {
    if (!entry.splitChain) {
      return [{ id: entry.id, command: entry.command }];
    }
    const scriptName = entry.command.replace(/^pnpm (?:run )?/u, '');
    const chain = scripts[scriptName];
    if (!chain) return [{ id: entry.id, command: entry.command }];
    return chain.split(' && ').map((segment, index) => ({
      id: `${entry.id}:${index + 1} ${commandLabel(segment, 64)}`,
      command: segment,
    }));
  });
}

/**
 * Measured source-guard long poles start first when pooling (the merged-with-base
 * guard is 216-250s and script contracts ~75s of the ~360s serial shard). A
 * stale entry only loses the head start; output order is unchanged.
 */
const SOURCE_GUARD_LONG_POLES = Object.freeze([
  'merged-with-base-invariants',
  'script-contracts',
]);

/** Guards that touch shared git state (worktrees, fetches, merges) share one
 * lock so they never overlap on the same checkout's git metadata. */
const SOURCE_GUARD_GIT_PATTERN =
  /\bgit (?:worktree|fetch|merge|checkout|reset|stash)\b/u;

/**
 * Shared writable state a source guard touches, derived from the command text:
 * the structuralLocks taxonomy (coverage dirs, COVERAGE_FILE, the pytest
 * cache, opaque entry points) plus one shared "git" lock — two guards running
 * `git worktree`/`git fetch`/`git merge` on the same checkout race on
 * .git/worktrees state and refs, so the merged-with-base and lanes-selftest
 * guards serialize.
 * @param {string} command
 * @returns {string[]}
 */
export function sourceGuardLocks(command) {
  const locks = new Set(structuralLocks(command));
  if (SOURCE_GUARD_GIT_PATTERN.test(command)) locks.add('git');
  return [...locks].sort();
}

/**
 * Bounded concurrency for source guards. Default: at most 3 — the vitest-based
 * guards are CPU-hungry and oversubscribing 4-vCPU runners invites timeout
 * flakes. SOURCE_GUARD_CONCURRENCY=1 reproduces today's serial loop exactly.
 * @param {string | undefined} [value] defaults to SOURCE_GUARD_CONCURRENCY
 * @returns {number}
 */
export function sourceGuardConcurrency(
  value = process.env.SOURCE_GUARD_CONCURRENCY
) {
  const parsed = Number(String(value ?? '').trim());
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return Math.max(1, Math.min(3, availableParallelism()));
}

/**
 * One buffered output block for a finished guard, wrapped in the workflow's
 * stop-commands window (guard tests print mocked `::error::` lines; a fake
 * rate-limit reset misled three workers on 2026-10-25) followed by the summary
 * line the Source Validation logs measure, and a real annotation on failure.
 * @param {string} id
 * @param {{code: number, output: string, durationMs?: number} | undefined} result
 * @returns {string}
 */
function sourceGuardBlock(id, result) {
  const token = randomUUID();
  const output = String(result?.output ?? '');
  return [
    `::stop-commands::${token}`,
    output === '' || output.endsWith('\n') ? output : `${output}\n`,
    `::${token}::`,
    `[source-guards] ${id}: exit ${result?.code ?? 1}; duration_ms=${Math.round(result?.durationMs ?? 0)}`,
    ...(result && result.code !== 0
      ? [
          `::error title=source guard ${id}::${id} failed (exit ${result.code}); read its output above.`,
        ]
      : []),
  ].join('\n');
}

/**
 * Repo-wide source guards (design-system ratchets, metrics layer, the locked
 * Pen marketing chrome contract) plus the PR's own changed unit tests. The
 * full Unit Tests shards run only in merge groups, so without this a PR that
 * trips a guard or breaks its own test is green on PR CI and fails every
 * merge group behind it (JOV-5301, JOV-6904; locked-pen-chrome-contract
 * poisoned a batch on #19266).
 *
 * Guards run with bounded concurrency instead of strictly serially, keeping
 * today's guarantees exactly: run-all (every selected guard runs even after
 * one fails), the exit code is the first failing guard in list order, each
 * guard's output prints as one contiguous block in list order, and guards
 * sharing writable state never overlap (sourceGuardLocks). Independent guards
 * report every failure in one run.
 * @param {readonly {id: string, command: string}[]} [guards]
 *   defaults to the guards selected for this diff
 * @param {{execute?: (command: string) => {code: number, output: string} | Promise<{code: number, output: string}>, concurrency?: number, now?: () => number}} [opts]
 * @returns {Promise<{code: number, output: string, skipped?: boolean}>}
 */
export async function runSourceGuards(guards, opts = {}) {
  const event = process.env.GITHUB_EVENT_NAME || '';
  const selected = guards ?? selectSourceGuards(event, listAllChangedFiles());
  if (selected.length === 0) {
    return {
      code: 0,
      output: 'Source-read guards skipped (no guard input changed)\n',
      skipped: true,
    };
  }
  const concurrency = opts.concurrency ?? sourceGuardConcurrency();
  // Blocks print the moment every earlier guard's block has printed, so the
  // log stays in list order even though completion order differs.
  let nextToPrint = 0;
  /** @type {Map<number, string>} */
  const blocks = new Map();
  const results = await runCommandPool(
    selected.map(guard => guard.command),
    {
      execute: opts.execute ?? shellAsync,
      concurrency,
      locks: selected.map(guard => sourceGuardLocks(guard.command)),
      // Run-all: a failing guard must not hide later guards' failures.
      keepGoing: true,
      // Long poles start first; serial runs keep strict list order.
      first:
        concurrency > 1
          ? selected.flatMap((guard, index) =>
              SOURCE_GUARD_LONG_POLES.includes(guard.id) ? [index] : []
            )
          : [],
      now: opts.now,
      onSettle: (index, result) => {
        blocks.set(index, sourceGuardBlock(selected[index].id, result));
        while (blocks.has(nextToPrint)) {
          console.log(blocks.get(nextToPrint));
          blocks.delete(nextToPrint);
          nextToPrint += 1;
        }
      },
    }
  );
  let code = 0;
  const combined = results
    .map((result, index) => {
      const block = sourceGuardBlock(selected[index].id, result);
      if (result?.code !== 0 && code === 0) code = result?.code ?? 1;
      return block;
    })
    .join('\n');
  return { code, output: `${combined}\n` };
}

/**
 * Pool runner for the merged-with-base guard's sub-commands, invoked as
 * `node <this module> --run-source-guard-pool <spec.json>` from inside the
 * merged worktree. Run-all semantics: every entry runs even after one fails,
 * and the exit code is the first failure in list order (the old `set -e`
 * chain stopped at the first failure; any-failure → fail is at least as
 * strict). Each entry's stdout+stderr prints as one buffered contiguous
 * block, in list order, followed by a measurable summary line.
 * @param {{commands: readonly {id: string, command: string, splitChain?: boolean}[], concurrency?: number}} spec
 * @param {{execute?: (command: string) => {code: number, output: string} | Promise<{code: number, output: string}>, now?: () => number}} [opts]
 * @returns {Promise<{code: number, output: string}>}
 */
/**
 * Concurrency for the nested merged-with-base subpool.
 *
 * The top-level Validate pool defaults SOURCE_GUARD_CONCURRENCY=3 so
 * script-contracts and merged-with-base can overlap without starving a
 * 4-vCPU runner. That default must NOT silently cap this nested pool:
 * MERGED_WITH_BASE_POOL_CONCURRENCY=4 is the intended width once the
 * invariants chain is split. SOURCE_GUARD_CONCURRENCY=1 remains the
 * documented serial debug switch for the whole Validate step.
 * @param {number | undefined} specConcurrency
 * @returns {number}
 */
export function mergedWithBasePoolConcurrency(specConcurrency) {
  const nestedEnv = process.env.MERGED_WITH_BASE_POOL_CONCURRENCY;
  if (nestedEnv !== undefined && String(nestedEnv).trim() !== '') {
    const parsed = Number(String(nestedEnv).trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (String(process.env.SOURCE_GUARD_CONCURRENCY ?? '').trim() === '1') {
    return 1;
  }
  return Math.max(
    1,
    Math.min(
      specConcurrency ?? MERGED_WITH_BASE_POOL_CONCURRENCY,
      availableParallelism()
    )
  );
}

export async function runSourceGuardPool(spec, opts = {}) {
  const entries = expandSourcePoolEntries(spec);
  const commands = entries.map(entry => entry.command);
  const concurrency = mergedWithBasePoolConcurrency(spec.concurrency);
  const results = await runCommandPool(commands, {
    execute: opts.execute ?? shellAsync,
    concurrency,
    locks: commands.map(command => structuralLocks(command)),
    keepGoing: true,
    first:
      concurrency > 1
        ? entries.flatMap((entry, index) =>
            MERGED_WITH_BASE_POOL_LONG_POLES.some(pole =>
              entry.command.includes(pole)
            )
              ? [index]
              : []
          )
        : [],
    now: opts.now,
  });
  let code = 0;
  const output = results
    .map((result, index) => {
      if (result?.code !== 0 && code === 0) code = result?.code ?? 1;
      const text = String(result?.output ?? '');
      const separator = text === '' || text.endsWith('\n') ? '' : '\n';
      return `${text}${separator}[merged-with-base] ${entries[index].id}: exit ${result?.code ?? 1}; duration_ms=${Math.round(result?.durationMs ?? 0)}`;
    })
    .join('\n');
  return { code, output: `${output}\n` };
}

/** CLI entry: node <module> --run-source-guard-pool <spec.json> */
export async function runSourceGuardPoolCli(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { code, output } = await runSourceGuardPool(spec);
  process.stdout.write(output);
  return code;
}
