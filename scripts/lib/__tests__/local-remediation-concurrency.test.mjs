import { describe, expect, it } from 'vitest';
import {
  LOCAL_FULL_SUITE_SHARD_COUNT,
  resolveLocalRemediationConcurrency,
} from '../local-remediation-concurrency.mjs';

const gib = 1024 ** 3;
const healthyMac = {
  cpuCount: 10,
  loadAverage1m: 2,
  totalMemoryBytes: 32 * gib,
  freeMemoryBytes: 20 * gib,
};

describe('local remediation concurrency', () => {
  it('adapts the default below the saturated eight-shard path', () => {
    expect(
      resolveLocalRemediationConcurrency({
        commandCount: LOCAL_FULL_SUITE_SHARD_COUNT,
        maxWorkersPerShard: 2,
        resources: healthyMac,
      })
    ).toMatchObject({ concurrency: 4, mode: 'adaptive', commandCap: 8 });
  });

  it('never starts more workers than actual shard commands', () => {
    expect(
      resolveLocalRemediationConcurrency({
        commandCount: 3,
        requested: 16,
        resources: healthyMac,
      })
    ).toMatchObject({ concurrency: 3, commandCount: 3, commandCap: 3 });
  });

  it('keeps eight shards behind an explicit healthy-machine opt-in', () => {
    expect(
      resolveLocalRemediationConcurrency({
        commandCount: 8,
        requested: 8,
        resources: healthyMac,
      })
    ).toMatchObject({
      concurrency: 8,
      mode: 'explicit-eight-shard-fast-path',
    });
  });

  it('falls back under the observed 31-of-32 GiB memory pressure', () => {
    expect(
      resolveLocalRemediationConcurrency({
        commandCount: 8,
        requested: 8,
        resources: {
          ...healthyMac,
          freeMemoryBytes: 1 * gib,
        },
      })
    ).toMatchObject({ concurrency: 1, mode: 'pressure-fallback' });
  });

  it('falls back when load reaches the available CPU count', () => {
    expect(
      resolveLocalRemediationConcurrency({
        commandCount: 8,
        resources: { ...healthyMac, loadAverage1m: 10 },
      })
    ).toMatchObject({ concurrency: 1, mode: 'pressure-fallback' });
  });
});
