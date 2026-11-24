import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
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

  const startedFor = async (shard, products) => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_PRODUCT_LANES', products);
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

  const workflow = /** @type {{ jobs: Record<string, any> }} */ (
    load(
      readFileSync(
        new URL('../../../.github/workflows/ci.yml', import.meta.url),
        'utf8'
      )
    )
  );
  it.each(['operations', 'web', 'mac', 'operations,web,mac', 'none'])(
    'partitions the actual remaining matrix exactly once for %s',
    async products => {
      const job = workflow.jobs['ci-fast-remaining-shards'];
      expect(job.env.CI_FAST_STRUCTURAL_SHARD).toBe('${{ matrix.shard }}/3');
      expect(job.strategy.matrix.shard).toEqual([1, 2, 3]);
      const whole = await startedFor(undefined, products);
      if (products.includes('operations'))
        expect(whole.length).toBeGreaterThan(0);
      const legs = [];
      for (const shard of job.strategy.matrix.shard)
        legs.push(await startedFor(`${shard}/3`, products));
      expect(legs.flat().sort()).toEqual([...whole].sort());
      expect(new Set(legs.flat()).size).toBe(whole.length);
      for (let i = 0; i < legs.length; i++)
        expect(legs[i]).toEqual(
          whole.filter((_, index) => index % legs.length === i)
        );
    }
  );

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
    const job = /** @type {{ jobs: Record<string, any> }} */ (
      load(
        readFileSync(
          new URL('../../../.github/workflows/ci.yml', import.meta.url),
          'utf8'
        )
      )
    ).jobs['ci-fast-structural-lanes-shards'];
    expect(job.env.CI_FAST_STRUCTURAL_LANES).toBe('only:${{ matrix.group }}');
    expect([...job.strategy.matrix.group].sort()).toEqual(
      Object.keys(LANES_COVERAGE_GROUP_COMMANDS).sort()
    );
    for (const group of job.strategy.matrix.group) {
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
    for (const group of Object.keys(LANES_COVERAGE_GROUP_SHARDS)) {
      expect(LANES_COVERAGE_GROUP_COMMANDS[group]).toContain(
        `jovie-lanes-${group}.coverage`
      );
    }
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
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:a');
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
      vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:c');
      const started = [];
      const result = await runStructural({
        changedFileList: ['apps/web/components/features/profile/Foo.tsx'],
        execute: command => {
          started.push(command);
          return { code: 0, output: '' };
        },
      });
      expect(started).toEqual([LANES_COVERAGE_GROUP_COMMANDS.c]);
      expect(result.skipped).not.toBe(true);
      vi.unstubAllEnvs();
    }
  });

  it('skips cleanly on a no-op head and runs on manual dispatch', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'merge_group');
    vi.stubEnv('CI_PRODUCT_LANES', 'none');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:a');
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
    // Pin the lanes family too: the structural runner legitimately executes
    // this suite with the host's CI_PRODUCT_LANES (a web-only merge-group
    // entry carries 'web'), which drops the operations-owned lanes coverage
    // slot and would leave the leg swap nothing to swap (JOV-10063: every
    // web-lane merge_group entry failed here while main's own push stayed
    // green). Same pin every sibling test in this file uses.
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_FAST_STRUCTURAL_LANES', 'only:a');
    const dispatched = [];
    await runStructural({
      execute: command => {
        dispatched.push(command);
        return { code: 0, output: '' };
      },
    });
    expect(dispatched).toEqual([LANES_COVERAGE_GROUP_COMMANDS.a]);
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
