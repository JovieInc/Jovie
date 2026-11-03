import os from 'node:os';

/**
 * Worker cap for non-CI vitest runs (pre-commit/pre-push hooks, agent gates).
 * Vitest's default is every core minus one; on the shared 16-core host four
 * concurrent hook runs reached load 17-21 and starved every lane (2026-10-25).
 * Idle machines keep the default; once the one-minute load is at or above half
 * the cores a run takes a quarter of them (min 2). VITEST_LOCAL_MAX_WORKERS wins.
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   cpus?: number,
 *   load1?: number,
 * }} [options]
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

/**
 * Apply the local policy before launching Vitest, so this covered helper is
 * not a configuration dependency that expands related runs to every test.
 * CLI limits and the existing CI policy keep their precedence.
 * @param {string[]} args
 * @param {Parameters<typeof localMaxWorkers>[0]} [options]
 * @returns {string[]}
 */
export function withLocalWorkerLimit(args, options) {
  const env = options?.env ?? process.env;
  if (
    env.CI === 'true' ||
    args.some(arg => /^--max(?:Workers|-workers)(?:=|$)/.test(arg))
  ) {
    return args;
  }
  const limit = localMaxWorkers(options);
  return limit === undefined ? args : [...args, `--maxWorkers=${limit}`];
}
