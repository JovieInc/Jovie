import { availableParallelism, freemem, loadavg, totalmem } from 'node:os';

export const LOCAL_FULL_SUITE_SHARD_COUNT = 8;
export const LOCAL_SHARD_FAST_PATH = 8;

const GIB = 1024 ** 3;
const RESERVED_CPUS = 2;
const MEMORY_PER_SHARD_BYTES = 3.5 * GIB;
const MEMORY_RESERVE_RATIO = 0.2;
const PRESSURE_RATIO = 0.85;

function positiveInteger(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

export function observeLocalRemediationResources() {
  return {
    cpuCount: availableParallelism(),
    loadAverage1m: loadavg()[0],
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
  };
}

export function resolveLocalRemediationConcurrency({
  commandCount,
  requested = 'auto',
  maxWorkersPerShard = 2,
  resources = observeLocalRemediationResources(),
}) {
  const commands = positiveInteger(commandCount, 'commandCount');
  const cpuCount = positiveInteger(resources.cpuCount, 'cpuCount');
  const workers = positiveInteger(maxWorkersPerShard, 'maxWorkersPerShard');
  const totalMemoryBytes = Number(resources.totalMemoryBytes);
  const freeMemoryBytes = Number(resources.freeMemoryBytes);
  const loadAverage1m = Math.max(0, Number(resources.loadAverage1m) || 0);
  if (
    !Number.isFinite(totalMemoryBytes) ||
    totalMemoryBytes <= 0 ||
    !Number.isFinite(freeMemoryBytes) ||
    freeMemoryBytes < 0 ||
    freeMemoryBytes > totalMemoryBytes
  ) {
    throw new Error('memory evidence must be finite and within total memory');
  }

  const memoryUsedRatio = 1 - freeMemoryBytes / totalMemoryBytes;
  const cpuPressureRatio = loadAverage1m / cpuCount;
  const pressure =
    memoryUsedRatio >= PRESSURE_RATIO || cpuPressureRatio >= PRESSURE_RATIO;
  const commandCap = Math.min(commands, LOCAL_FULL_SUITE_SHARD_COUNT);

  if (pressure) {
    return {
      concurrency: 1,
      mode: 'pressure-fallback',
      commandCount: commands,
      commandCap,
      cpuPressureRatio,
      memoryUsedRatio,
    };
  }

  if (requested !== 'auto') {
    const explicit = positiveInteger(requested, 'requested concurrency');
    const concurrency = Math.min(explicit, commandCap);
    return {
      concurrency,
      mode:
        concurrency === LOCAL_SHARD_FAST_PATH
          ? 'explicit-eight-shard-fast-path'
          : 'explicit-bounded',
      commandCount: commands,
      commandCap,
      cpuPressureRatio,
      memoryUsedRatio,
    };
  }

  // Each shard owns its own Vitest process and max-worker pool. Leave two CPU
  // slots for the OS/agent, then bound by the observed 3.5 GiB-per-shard peak.
  const cpuCap = Math.max(1, Math.floor((cpuCount - RESERVED_CPUS) / workers));
  const memoryCap = Math.max(
    1,
    Math.floor(
      (totalMemoryBytes * (1 - MEMORY_RESERVE_RATIO)) / MEMORY_PER_SHARD_BYTES
    )
  );
  return {
    concurrency: Math.min(commandCap, cpuCap, memoryCap),
    mode: 'adaptive',
    commandCount: commands,
    commandCap,
    cpuPressureRatio,
    memoryUsedRatio,
  };
}
