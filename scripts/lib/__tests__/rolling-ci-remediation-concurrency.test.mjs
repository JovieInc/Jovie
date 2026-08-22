import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCAL_CONCURRENCY,
  DEFAULT_LOCAL_SHARD_COUNT,
  detectHostPressure,
  OPT_IN_EIGHT_SHARD_COUNT,
  PRESSURE_FALLBACK_CONCURRENCY,
  planLocalRemediationConcurrency,
  REMOTE_RUNNER_FANOUT,
  resolveLocalRemediationConcurrency,
  resolveLocalRemediationShardCount,
} from '../rolling-ci-remediation-concurrency.mjs';

const tightHost = {
  load: 0,
  cpuCount: 16,
  freeMemoryBytes: 256 * 1024 * 1024,
  totalMemoryBytes: 16 * 1024 * 1024 * 1024,
};

describe('rolling CI local remediation concurrency', () => {
  it('keeps eight shards opt-in and defaults below that count', () => {
    expect(resolveLocalRemediationShardCount()).toBe(DEFAULT_LOCAL_SHARD_COUNT);
    expect(resolveLocalRemediationShardCount()).toBeLessThan(
      OPT_IN_EIGHT_SHARD_COUNT
    );
    expect(resolveLocalRemediationShardCount({ optInEightShards: true })).toBe(
      OPT_IN_EIGHT_SHARD_COUNT
    );
  });

  it('never exceeds the actual shard-command count', () => {
    expect(
      resolveLocalRemediationConcurrency({
        shardCommandCount: 3,
        requestedConcurrency: 8,
      })
    ).toMatchObject({
      concurrency: 3,
      shardCommandCount: 3,
      reason: 'command-count-cap',
    });
    expect(
      resolveLocalRemediationConcurrency({
        shardCommandCount: 1,
        requestedConcurrency: REMOTE_RUNNER_FANOUT,
      }).concurrency
    ).toBe(1);
  });

  it('falls back to one worker under memory pressure', () => {
    expect(
      resolveLocalRemediationConcurrency({
        shardCommandCount: 8,
        requestedConcurrency: 8,
        memoryPressure: true,
      })
    ).toMatchObject({
      concurrency: PRESSURE_FALLBACK_CONCURRENCY,
      reason: 'memory-pressure-fallback',
    });
    expect(detectHostPressure(tightHost)).toMatchObject({
      cpuPressure: false,
      memoryPressure: true,
    });
    expect(
      planLocalRemediationConcurrency({
        shardCommandCount: 8,
        requestedConcurrency: 8,
        host: tightHost,
      })
    ).toMatchObject({
      concurrency: 1,
      memoryPressure: true,
      reason: 'memory-pressure-fallback',
    });
  });

  it('falls back under CPU pressure and keeps remote fanout independent', () => {
    expect(
      resolveLocalRemediationConcurrency({
        shardCommandCount: 8,
        requestedConcurrency: 8,
        cpuPressure: true,
        remoteFanout: REMOTE_RUNNER_FANOUT,
      })
    ).toMatchObject({
      concurrency: 1,
      reason: 'cpu-pressure-fallback',
      remoteFanoutIndependent: true,
    });
    expect(
      resolveLocalRemediationConcurrency({
        shardCommandCount: DEFAULT_LOCAL_SHARD_COUNT,
        remoteFanout: REMOTE_RUNNER_FANOUT,
      })
    ).toMatchObject({
      concurrency: Math.min(
        DEFAULT_LOCAL_CONCURRENCY,
        DEFAULT_LOCAL_SHARD_COUNT
      ),
      remoteFanoutIndependent: true,
    });
    expect(REMOTE_RUNNER_FANOUT).toBe(120);
  });
});
