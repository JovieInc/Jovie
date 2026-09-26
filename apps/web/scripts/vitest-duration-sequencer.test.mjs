import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import DurationShardSequencer, {
  loadDurations,
  normalizeDurations,
  partitionByDuration,
} from './vitest-duration-sequencer.mjs';

const ROOT = '/repo/apps/web';
const files = n =>
  Array.from({ length: n }, (_, i) => `t/a${i % 37}/f${i}.test.ts`);
const spec = (file, project = 'jsdom') => ({
  moduleId: `${ROOT}/${file}`,
  project: { name: project, config: { sequence: { groupOrder: 0 } } },
});
const sequencer = (shard, durations) => {
  const s = new DurationShardSequencer({ config: { root: ROOT, shard } });
  s._durations = durations;
  return s;
};
function expectExactPartition(buckets, all) {
  const flat = buckets.flat();
  expect(new Set(flat).size).toBe(flat.length);
  expect([...flat].sort()).toEqual([...all].sort());
}
const spread = buckets => {
  const counts = buckets.map(b => b.length);
  return Math.max(...counts) - Math.min(...counts);
};

describe('partitionByDuration', () => {
  it('places every file in exactly one of 10 shards, independent of input order', () => {
    const all = files(3232);
    const d = {
      files: new Map(all.map((f, i) => [f, (i * 7919) % 5000])),
      defaultMs: 50,
    };
    const buckets = partitionByDuration(all, 10, d);
    expect(buckets).toHaveLength(10);
    expectExactPartition(buckets, all);
    expect(partitionByDuration([...all].reverse(), 10, d)).toEqual(buckets);
  });

  it('spreads heavy files one per shard', () => {
    const heavy = files(10).map(f => `heavy/${f}`);
    const d = { files: new Map(heavy.map(f => [f, 20_000])), defaultMs: 100 };
    const buckets = partitionByDuration([...files(200), ...heavy], 10, d);
    for (const b of buckets)
      expect(b.filter(f => f.startsWith('heavy/'))).toHaveLength(1);
  });

  it('weights unknown files with the default and degrades to equal counts', () => {
    const all = [...files(40), 'new/unmapped.test.ts'];
    const d = normalizeDurations({
      overheadMs: 700,
      defaultTestMs: 30,
      files: {},
    });
    expect(d.defaultMs).toBe(730);
    const buckets = partitionByDuration(all, 10, d);
    expectExactPartition(buckets, all);
    expect(spread(buckets)).toBeLessThanOrEqual(1);
    expect(
      spread(partitionByDuration(files(323), 10, normalizeDurations(null)))
    ).toBeLessThanOrEqual(1);
  });

  it('preloads reserved shard cost so LPT gives that shard less work', () => {
    const all = files(100);
    const d = { files: new Map(), defaultMs: 100 };
    const buckets = partitionByDuration(all, 4, d, { '2/4': 2000 });
    expectExactPartition(buckets, all);
    expect(buckets.map(b => b.length)).toEqual([30, 10, 30, 30]);
    expect(partitionByDuration(all, 5, d, { '2/4': 2000 })[1]).toHaveLength(20);
  });

  it('rejects an invalid shard count', () => {
    expect(() => partitionByDuration([], 0, normalizeDurations(null))).toThrow(
      /positive integer/
    );
  });
});

describe('loadDurations', () => {
  it('adds overhead, drops invalid entries, and survives a corrupt or missing file', () => {
    expect(
      Object.fromEntries(
        normalizeDurations({
          overheadMs: 700,
          files: { a: 100, b: -1, c: 'x' },
        }).files
      )
    ).toEqual({ a: 800 });
    const dir = mkdtempSync(path.join(tmpdir(), 'shard-durations-'));
    try {
      writeFileSync(path.join(dir, 'bad.json'), '{not json');
      expect(loadDurations(path.join(dir, 'bad.json')).files.size).toBe(0);
      expect(loadDurations(path.join(dir, 'missing.json')).defaultMs).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ships a checked-in map of relative paths to non-negative test ms', () => {
    const d = loadDurations();
    expect(d.files.size).toBeGreaterThan(20);
    expect(d.defaultMs).toBeGreaterThan(1);
    for (const file of d.files.keys())
      expect(file).toMatch(/^[^/\\].*\.(test|spec)\.[cm]?[jt]sx?$/);
  });
});

describe('DurationShardSequencer', () => {
  const all = [...files(120), 't/huge.test.ts', 't/big.test.ts'];
  const d = normalizeDurations({
    overheadMs: 100,
    defaultTestMs: 10,
    files: {
      't/huge.test.ts': 30_000,
      't/big.test.ts': 9000,
      't/deleted.test.ts': 99_999,
    },
  });

  it('partitions real specs across shard indexes 1..10 without overlap or loss', async () => {
    const perShard = [];
    for (let index = 1; index <= 10; index++) {
      const picked = await sequencer({ index, count: 10 }, d).shard(
        all.map(f => spec(f))
      );
      perShard.push(picked.map(s => path.relative(ROOT, s.moduleId)));
    }
    expectExactPartition(perShard, all);
    expect(perShard.find(list => list.includes('t/huge.test.ts'))).toEqual([
      't/huge.test.ts',
    ]);
  });

  it('places a file shared by two projects once per project', async () => {
    const specs = [
      spec('shared.test.ts', 'node'),
      spec('shared.test.ts', 'jsdom'),
    ];
    const picked = [
      ...(await sequencer({ index: 1, count: 2 }, d).shard(specs)),
      ...(await sequencer({ index: 2, count: 2 }, d).shard(specs)),
    ];
    expect(picked.map(s => s.project.name).sort()).toEqual(['jsdom', 'node']);
  });

  it('runs the heaviest files first within a shard', async () => {
    const sorted = await sequencer({ index: 1, count: 1 }, d).sort(
      ['t/f1.test.ts', 't/big.test.ts', 't/huge.test.ts'].map(f => spec(f))
    );
    expect(sorted.map(s => path.basename(s.moduleId))).toEqual([
      'huge.test.ts',
      'big.test.ts',
      'f1.test.ts',
    ]);
  });
});
