import os from 'node:os';

/**
 * Worker cap for non-CI vitest runs (pre-commit/pre-push hooks, agent gates).
 * Vitest's default is every core minus one; on the shared 16-core gem host four
 * concurrent hook runs reached load 17-21 and starved every lane (2026-10-25).
 * Idle machines keep the default; once the one-minute load is at or above half
 * the cores a run takes a quarter of them (min 2). VITEST_LOCAL_MAX_WORKERS wins.
 * @returns {number | undefined} undefined keeps vitest's default.
 */
export function localMaxWorkers({
  env = process.env,
  cpus = os.availableParallelism(),
  load1 = os.loadavg()[0],
} = {}) {
  const explicit = Number.parseInt(env.VITEST_LOCAL_MAX_WORKERS ?? '', 10);
  if (Number.isInteger(explicit) && explicit >= 1) return explicit;
  return load1 >= cpus / 2 ? Math.max(2, Math.floor(cpus / 4)) : undefined;
}
