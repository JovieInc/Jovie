import { availableParallelism, freemem, loadavg, totalmem } from 'node:os';

export const DEFAULT_LOCAL_SHARD_COUNT = 2;
export const OPT_IN_EIGHT_SHARD_COUNT = 8;
export const DEFAULT_LOCAL_CONCURRENCY = 2;
export const PRESSURE_FALLBACK_CONCURRENCY = 1;
/** GitHub unit-test max-parallel. Local remediation must never copy this. */
export const REMOTE_RUNNER_FANOUT = 120;
export const MEMORY_PRESSURE_FREE_RATIO = 0.2;
export const MEMORY_PRESSURE_FREE_BYTES = 1 * 1024 * 1024 * 1024;

/** @typedef {{
 *   load?: number,
 *   cpuCount?: number,
 *   freeMemoryBytes?: number,
 *   totalMemoryBytes?: number,
 * }} HostPressureInput */

/** @typedef {{
 *   shardCommandCount?: number,
 *   requestedConcurrency?: number,
 *   optInEightShards?: boolean,
 *   cpuPressure?: boolean,
 *   memoryPressure?: boolean,
 *   remoteFanout?: number,
 *   host?: HostPressureInput,
 * }} LocalRemediationConcurrencyInput */

function positiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * @param {{ optInEightShards?: boolean }} [input]
 */
export function resolveLocalRemediationShardCount(input = {}) {
  return input.optInEightShards
    ? OPT_IN_EIGHT_SHARD_COUNT
    : DEFAULT_LOCAL_SHARD_COUNT;
}

/**
 * @param {HostPressureInput} [input]
 */
export function detectHostPressure(input = {}) {
  const {
    load = loadavg()[0],
    cpuCount = availableParallelism(),
    freeMemoryBytes = freemem(),
    totalMemoryBytes = totalmem(),
  } = input;
  const cpus = Math.max(1, positiveInt(cpuCount, 1));
  const free = Math.max(0, Number(freeMemoryBytes) || 0);
  const total = Math.max(1, Number(totalMemoryBytes) || 1);
  const loadAvg = Number(load);
  const cpuPressure = Number.isFinite(loadAvg) && loadAvg >= cpus;
  const memoryPressure =
    free < MEMORY_PRESSURE_FREE_BYTES ||
    free / total < MEMORY_PRESSURE_FREE_RATIO;
  return { cpuPressure, memoryPressure, cpuCount: cpus, freeMemoryBytes: free };
}

/**
 * Adaptive local remediation concurrency.
 * Remote 120-runner fanout is independent and never raises the local cap.
 *
 * @param {LocalRemediationConcurrencyInput} [input]
 */
export function resolveLocalRemediationConcurrency(input = {}) {
  const {
    shardCommandCount,
    requestedConcurrency,
    optInEightShards = false,
    cpuPressure = false,
    memoryPressure = false,
    remoteFanout = REMOTE_RUNNER_FANOUT,
  } = input;
  const plannedShardCount = resolveLocalRemediationShardCount({
    optInEightShards,
  });
  const parsedCommandCount = Number.parseInt(
    String(shardCommandCount ?? ''),
    10
  );
  const commandCount =
    shardCommandCount === undefined || shardCommandCount === null
      ? plannedShardCount
      : Number.isInteger(parsedCommandCount) && parsedCommandCount >= 0
        ? parsedCommandCount
        : plannedShardCount;
  const ignoredRemoteFanout = positiveInt(remoteFanout, REMOTE_RUNNER_FANOUT);

  if (commandCount === 0) {
    return {
      concurrency: 0,
      shardCommandCount: 0,
      plannedShardCount,
      reason: 'no-shard-commands',
      remoteFanoutIndependent: ignoredRemoteFanout !== commandCount,
    };
  }

  if (cpuPressure || memoryPressure) {
    const concurrency = Math.min(PRESSURE_FALLBACK_CONCURRENCY, commandCount);
    return {
      concurrency,
      shardCommandCount: commandCount,
      plannedShardCount,
      reason: memoryPressure
        ? 'memory-pressure-fallback'
        : 'cpu-pressure-fallback',
      remoteFanoutIndependent: concurrency !== ignoredRemoteFanout,
    };
  }

  const requested = positiveInt(
    requestedConcurrency,
    Math.min(DEFAULT_LOCAL_CONCURRENCY, commandCount)
  );
  const concurrency = Math.min(requested, commandCount);
  const cappedByCommands = requested > commandCount;
  return {
    concurrency,
    shardCommandCount: commandCount,
    plannedShardCount,
    reason: cappedByCommands ? 'command-count-cap' : 'requested',
    remoteFanoutIndependent: concurrency !== ignoredRemoteFanout,
  };
}

/**
 * @param {LocalRemediationConcurrencyInput} [input]
 */
export function planLocalRemediationConcurrency(input = {}) {
  const pressure = detectHostPressure(input.host);
  return {
    ...resolveLocalRemediationConcurrency({
      ...input,
      cpuPressure: input.cpuPressure ?? pressure.cpuPressure,
      memoryPressure: input.memoryPressure ?? pressure.memoryPressure,
    }),
    cpuPressure: input.cpuPressure ?? pressure.cpuPressure,
    memoryPressure: input.memoryPressure ?? pressure.memoryPressure,
  };
}
