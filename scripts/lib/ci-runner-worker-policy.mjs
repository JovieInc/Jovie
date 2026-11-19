/**
 * JOV-13107: hosted job worker counts must derive from `nproc`, or from a
 * documented exception. Auto-revert to 2 when verified flips exceed 2% is
 * the contract; the live hook is JOV-13120 (blocked on the JOV-13105
 * flake collector, which is not on main yet).
 */

export const CI_WORKER_POLICY_ISSUE = 'JOV-13107';
export const CI_WORKER_REVERT_TO = 2;
/** Revert only when the measured rate is strictly above this fraction. */
export const CI_WORKER_FLIP_REVERT_THRESHOLD = 0.02;
export const CI_WORKER_LIVE_REVERT_ISSUE = 'JOV-13120';

/**
 * Two structural pytest shards share `ci-fast (structural python)` (the
 * structural pool default concurrency is 3). Dividing `nproc` by this keeps
 * all cores busy without oversubscribing.
 */
export const STRUCTURAL_PYTEST_OVERLAPPING_SHARDS = 2;

/**
 * Shell expression for pytest-xdist `-n`. Quoted so the job command can
 * interpolate it after `-n`. Literal `-n auto` per shard was measured
 * slower when both shards overlap (JovieInc/Jovie#18657).
 */
export const STRUCTURAL_PYTEST_XDIST_N =
  '"$(( w=$(nproc) / 2, w < 1 ? 1 : w ))"';

/** Vitest 5.1 accepts a number or a percentage, not the token `auto`. */
export const BLOG_VITEST_MAX_WORKERS = '$(nproc)';

/**
 * Playwright CLI workers for `ci-storybook-surfaces`. Documented exception:
 * start at 3, not `nproc`/4, because the Storybook server and browsers share
 * the 4 vCPU runner. Raise to 4 only if the flake signal stays quiet.
 */
export const STORYBOOK_PLAYWRIGHT_WORKERS = 3;

/**
 * @param {unknown} flipRate
 * @returns {boolean}
 */
export function shouldRevertCiWorkerCounts(flipRate) {
  if (
    typeof flipRate !== 'number' ||
    !Number.isFinite(flipRate) ||
    flipRate < 0
  ) {
    return false;
  }
  return flipRate > CI_WORKER_FLIP_REVERT_THRESHOLD;
}

export const CI_RUNNER_WORKER_POLICY = Object.freeze({
  issue: CI_WORKER_POLICY_ISSUE,
  revertTo: CI_WORKER_REVERT_TO,
  flipThreshold: CI_WORKER_FLIP_REVERT_THRESHOLD,
  liveRevert: Object.freeze({
    status: 'LATER',
    issue: CI_WORKER_LIVE_REVERT_ISSUE,
    blockedOn: 'JOV-13105',
  }),
  jobs: Object.freeze({
    'ci-fast-structural-python': Object.freeze({
      tool: 'pytest-xdist',
      flag: '-n',
      commandExpr: STRUCTURAL_PYTEST_XDIST_N,
      derivation: 'nproc-div-overlapping-shards',
      overlappingShards: STRUCTURAL_PYTEST_OVERLAPPING_SHARDS,
      reason:
        'Two pytest shards share the 4 vCPU ci-fast (structural python) job. Literal -n auto per shard oversubscribes and was measured slower (JovieInc/Jovie#18657). nproc/2 uses every core without adding shards (JOV-13072 owns shards).',
    }),
    'ci-storybook-surfaces': Object.freeze({
      tool: 'playwright',
      flag: '--workers',
      value: STORYBOOK_PLAYWRIGHT_WORKERS,
      derivation: 'documented-exception',
      reason:
        'Browser-bound Storybook Playwright plus the Storybook dev server share the 4 vCPU runner. Start at 3 workers, not nproc/4, to limit memory pressure; raise to 4 only if the flake signal stays quiet.',
    }),
    'ci-blog-content': Object.freeze({
      tool: 'vitest',
      flag: '--maxWorkers',
      commandExpr: BLOG_VITEST_MAX_WORKERS,
      derivation: 'nproc',
      reason:
        'Vitest 5.1 accepts a number or a percentage, not the token auto (Number("auto") is NaN). $(nproc) is the repo nproc-derived form already used by unit tests.',
    }),
  }),
});
