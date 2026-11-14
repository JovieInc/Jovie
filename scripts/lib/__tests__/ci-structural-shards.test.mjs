import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LANES_COVERAGE_COMMAND,
  LANES_COVERAGE_FLOORS,
  LANES_COVERAGE_GROUP_COMMANDS,
  LANES_COVERAGE_GROUP_SHARDS,
  LANES_PYTEST_SHARDS,
  lanesReceiptRanSuite,
  runStructural,
  selectStructuralShard,
} from '../../ci-fast-lanes.mjs';

describe('structural core matrix shards', () => {
  afterEach(() => vi.unstubAllEnvs());

  const startedFor = async shard => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_PYTEST', 'skip');
    vi.stubEnv('CI_FAST_STRUCTURAL_WEB', 'skip');
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'skip');
    if (shard) vi.stubEnv('CI_FAST_STRUCTURAL_SHARD', shard);
    const started = [];
    await runStructural({
      // Serial runs keep strict list order (no long-pole-first reordering),
      // so `started` reflects the partition itself.
      concurrency: 1,
      execute: command => {
        started.push(command);
        return { code: 0, output: '' };
      },
    });
    return started;
  };

  it('partitions the structural pool across the matrix legs without dropping or duplicating a command', async () => {
    const whole = await startedFor(undefined);
    const first = await startedFor('1/2');
    const second = await startedFor('2/2');
    expect(whole.length).toBeGreaterThan(0);
    expect([...first, ...second].sort()).toEqual([...whole].sort());
    expect(new Set([...first, ...second]).size).toBe(whole.length);
    // Round-robin keeps each shard's list order and spreads the pool evenly.
    expect(first).toEqual(whole.filter((_, index) => index % 2 === 0));
    expect(second).toEqual(whole.filter((_, index) => index % 2 === 1));
  });

  it('partitions a known list deterministically and rejects bad specs', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'];
    expect(selectStructuralShard(pool, '1/2')).toEqual(['a', 'c', 'e']);
    expect(selectStructuralShard(pool, '2/2')).toEqual(['b', 'd']);
    expect(selectStructuralShard(pool, '1/1')).toEqual(pool);
    for (const bad of ['0/2', '3/2', 'x', '1/0', '']) {
      expect(() => selectStructuralShard(pool, bad)).toThrow(
        'CI_FAST_STRUCTURAL_SHARD'
      );
    }
  });

  it('fails closed on an invalid shard spec', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_SHARD', '3/2');
    await expect(
      runStructural({ execute: () => ({ code: 0, output: '' }) })
    ).rejects.toThrow('CI_FAST_STRUCTURAL_SHARD');
  });
});

describe('lanes coverage matrix legs', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('runs exactly one leg command for only:<group>', async () => {
    for (const group of Object.keys(LANES_COVERAGE_GROUP_COMMANDS)) {
      vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
      vi.stubEnv('CI_PRODUCT_LANES', 'operations');
      vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
      vi.stubEnv('CI_FAST_STRUCTURAL_LANES', `only:${group}`);
      const started = [];
      await runStructural({
        execute: command => {
          started.push(command);
          return { code: 0, output: '' };
        },
      });
      expect(started).toEqual([LANES_COVERAGE_GROUP_COMMANDS[group]]);
      vi.unstubAllEnvs();
    }
  });

  it('fails closed on an unknown lanes group', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:zz');
    await expect(
      runStructural({ execute: () => ({ code: 0, output: '' }) })
    ).rejects.toThrow('CI_FAST_STRUCTURAL_LANES');
  });

  it('covers every lanes shard exactly once across the matrix legs', () => {
    const grouped = Object.values(LANES_COVERAGE_GROUP_SHARDS).flat();
    expect([...grouped].sort()).toEqual(
      LANES_PYTEST_SHARDS.map(shard => shard.id).sort()
    );
    for (const command of Object.values(LANES_COVERAGE_GROUP_COMMANDS)) {
      expect(command).toContain('coverage combine');
      expect(command).not.toContain('--fail-under');
    }
    expect(LANES_COVERAGE_GROUP_COMMANDS.ab).toContain(
      'jovie-lanes-ab.coverage'
    );
    expect(LANES_COVERAGE_GROUP_COMMANDS.cd).toContain(
      'jovie-lanes-cd.coverage'
    );
  });

  it('keeps the shared export as the single source for the combined report', () => {
    expect(LANES_COVERAGE_FLOORS).toHaveLength(26);
    for (const { include, floor } of LANES_COVERAGE_FLOORS) {
      expect(LANES_COVERAGE_COMMAND).toContain(
        `--include="${include}" --fail-under=${floor}`
      );
    }
    expect(LANES_COVERAGE_COMMAND.match(/--fail-under=/g)?.length).toBe(26);
  });

  it('runs no leg command and reports a clean skip on a web-only head', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
    vi.stubEnv('CI_PRODUCT_LANES', 'web');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:ab');
    const started = [];
    const result = await runStructural({
      changedFileList: ['apps/web/components/features/profile/Foo.tsx'],
      execute: command => {
        started.push(command);
        return { code: 0, output: '' };
      },
    });
    expect(started).toEqual([]);
    expect(result.skipped).toBe(true);
  });

  it('runs the leg command for operations and mixed heads', async () => {
    for (const productLanes of ['operations', 'web,operations']) {
      vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
      vi.stubEnv('CI_PRODUCT_LANES', productLanes);
      vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
      vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:cd');
      const started = [];
      const result = await runStructural({
        changedFileList: ['apps/web/components/features/profile/Foo.tsx'],
        execute: command => {
          started.push(command);
          return { code: 0, output: '' };
        },
      });
      expect(started).toEqual([LANES_COVERAGE_GROUP_COMMANDS.cd]);
      expect(result.skipped).not.toBe(true);
      vi.unstubAllEnvs();
    }
  });

  it('skips cleanly on a no-op head and runs on manual dispatch', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'merge_group');
    vi.stubEnv('CI_PRODUCT_LANES', 'none');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:ab');
    const started = [];
    const skipped = await runStructural({
      changedFileList: [],
      execute: command => {
        started.push(command);
        return { code: 0, output: '' };
      },
    });
    expect(started).toEqual([]);
    expect(skipped.skipped).toBe(true);
    vi.unstubAllEnvs();

    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:ab');
    const dispatched = [];
    await runStructural({
      execute: command => {
        dispatched.push(command);
        return { code: 0, output: '' };
      },
    });
    expect(dispatched).toEqual([LANES_COVERAGE_GROUP_COMMANDS.ab]);
  });

  it('gates evidence on the runner receipt, never a recomputed selection', () => {
    expect(
      lanesReceiptRanSuite({
        lanes: [{ id: 'structural', status: 'success' }],
      })
    ).toBe(true);
    expect(
      lanesReceiptRanSuite({
        lanes: [{ id: 'structural', status: 'skipped' }],
      })
    ).toBe(false);
    expect(() =>
      lanesReceiptRanSuite({
        lanes: [{ id: 'structural', status: 'failure' }],
      })
    ).toThrow(/reported failure/);
    expect(() => lanesReceiptRanSuite({ lanes: [] })).toThrow(
      /missing the structural lane/
    );
  });
});
