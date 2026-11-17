import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preflight } from '../../mutation-sweep-preflight.mjs';
import { validateMutationScoreBaseline } from '../mutation-score-floor.mjs';
import {
  buildSurvivorIssue,
  emptyState,
  extractSurvivors,
  MIN_RATCHET_VALID,
  mergeStates,
  moduleKey,
  parseShard,
  partitionEquivalents,
  pickBatch,
  proposeBaselineEntries,
  ratchetVerdict,
  recordRun,
  SURVIVORS_PER_TASK,
  selectPool,
  shardOf,
  survivorFingerprint,
  validateEquivalents,
} from '../mutation-sweep.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-24T12:00:00Z');

const mutant = (
  status,
  line,
  replacement = 'false',
  mutatorName = 'BooleanLiteral'
) => ({
  status,
  mutatorName,
  replacement,
  location: { start: { line, column: 16 }, end: { line, column: 20 } },
});
const SOURCE = [
  'export function ok(a: number) {',
  '  const flag = true;',
  '  return flag && a > 0;',
  '}',
].join('\n');

describe('pickBatch', () => {
  const cand = (file, blob = 'b1', testCount = 1) => ({
    file,
    blob,
    testCount,
  });
  const at = days => new Date(NOW - days * DAY).toISOString();
  const scored = (blob, days, status = 'scored') => ({
    blob,
    sha: null,
    at: at(days),
    status,
    score: 50,
    valid: 40,
    killed: 20,
    survived: 20,
    durationMs: 1,
  });

  it('ranks changed, then never-scored, then retry-after-error, then stale', () => {
    const state = emptyState();
    state.modules['changed.ts'] = scored('old', 2);
    state.modules['fresh.ts'] = scored('b1', 2);
    state.modules['stale.ts'] = scored('b1', 40);
    state.modules['err-old.ts'] = scored('b1', 2, 'error');
    state.modules['err-new.ts'] = {
      ...scored('b1', 0, 'error'),
      at: new Date(NOW - 3600_000).toISOString(),
    };
    const picked = pickBatch(
      state,
      [
        'new.ts',
        'changed.ts',
        'fresh.ts',
        'stale.ts',
        'err-old.ts',
        'err-new.ts',
      ].map(f => cand(f)),
      { max: 10, now: NOW }
    );
    expect(picked).toEqual(['changed.ts', 'new.ts', 'err-old.ts', 'stale.ts']);
  });

  it('honors max and prefers modules with a same-named test', () => {
    const picked = pickBatch(
      emptyState(),
      [cand('a.ts', 'b', 0), cand('b.ts', 'b', 1), cand('c.ts', 'b', 1)],
      { max: 2, now: NOW }
    );
    expect(picked).toEqual(['b.ts', 'c.ts']);
  });
});

describe('survivors', () => {
  it('extracts only Survived and NoCoverage mutants with evidence', () => {
    const survivors = extractSurvivors('lib/ok.ts', SOURCE, [
      mutant('Killed', 2),
      mutant('Survived', 2),
      mutant('NoCoverage', 3, 'true'),
    ]);
    expect(survivors.map(s => s.status).sort()).toEqual([
      'NoCoverage',
      'Survived',
    ]);
    expect(survivors[0].context).toContain('2:   const flag = true;');
    // Stryker locations are 1-based lines and columns: this slice is `true`.
    expect(survivors.find(s => s.status === 'Survived')?.original).toBe('true');
  });

  it('fingerprints survive line drift but not a changed mutation', () => {
    const base = {
      mutatorName: 'BooleanLiteral',
      replacement: 'false',
      original: 'true',
      lineText: '  const flag = true;',
    };
    expect(survivorFingerprint('f.ts', base)).toBe(
      survivorFingerprint('f.ts', {
        ...base,
        lineText: '   const  flag = true;',
      })
    );
    expect(survivorFingerprint('f.ts', base)).not.toBe(
      survivorFingerprint('f.ts', { ...base, replacement: 'null' })
    );
    expect(survivorFingerprint('f.ts', base)).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('suppresses recorded equivalent mutants and bounds the work item', () => {
    const all = Array.from({ length: SURVIVORS_PER_TASK + 4 }, (_, i) => ({
      fingerprint: i.toString(16).padStart(16, '0'),
      file: 'lib/ok.ts',
      line: i + 1,
      status: 'Survived',
      mutator: 'BooleanLiteral',
      original: 'true',
      replacement: 'false',
      context: `${i + 1}: x`,
    }));
    const { real, equivalent } = partitionEquivalents(all, {
      entries: [{ file: 'lib/ok.ts', fingerprint: all[0].fingerprint }],
    });
    expect(equivalent).toHaveLength(1);
    expect(real).toHaveLength(all.length - 1);
    const issue = buildSurvivorIssue('lib/ok.ts', real, {
      score: 41.2,
      valid: 90,
      tests: ['tests/ok.test.ts'],
      sha: 'a'.repeat(40),
    });
    expect(issue.fingerprint).toBe('mutation-survivors:lib/ok.ts');
    expect(issue.labelKey).toBe('mutation-survivors-lib-ok-ts');
    expect(issue.description.match(/^### /gmu)).toHaveLength(
      SURVIVORS_PER_TASK
    );
    expect(issue.description).toContain('Do not change production code');
    expect(issue.description).toContain('```diff');
  });

  it('requires a real justification for every equivalent entry', () => {
    expect(validateEquivalents({ schemaVersion: 1, entries: [] })).toEqual([]);
    const bad = validateEquivalents({
      schemaVersion: 1,
      entries: [
        { file: 'a.ts', fingerprint: 'xyz', reason: 'meh', addedBy: '' },
      ],
    });
    expect(bad.join('\n')).toMatch(/fingerprint/u);
    expect(bad.join('\n')).toMatch(/reason/u);
    expect(bad.join('\n')).toMatch(/addedBy/u);
  });

  it('keeps the committed registry valid', () => {
    const raw = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, 'scripts/mutation-equivalents.json'),
        'utf8'
      )
    );
    expect(validateEquivalents(raw)).toEqual([]);
  });
});

describe('moduleKey', () => {
  it('is the bare source blob when the module has no tests', () => {
    expect(moduleKey('a'.repeat(40), [])).toBe('a'.repeat(40));
  });

  it('changes when a test blob changes, so test-only kills are rescored', () => {
    const before = moduleKey('s', ['t1']);
    expect(moduleKey('s', ['t2'])).not.toBe(before);
    expect(moduleKey('s2', ['t1'])).not.toBe(before);
  });

  it('is independent of test order', () => {
    expect(moduleKey('s', ['t1', 't2'])).toBe(moduleKey('s', ['t2', 't1']));
  });

  it('makes pickBatch rank a test-only change first', () => {
    const state = emptyState();
    state.modules['lib/a.ts'] = {
      blob: moduleKey('s', ['t1']),
      sha: null,
      at: new Date().toISOString(),
      status: 'scored',
      score: 70,
      valid: 50,
      killed: 35,
      survived: 15,
      durationMs: 1,
    };
    const next = [
      { file: 'lib/a.ts', blob: moduleKey('s', ['t2']), testCount: 1 },
    ];
    expect(pickBatch(state, next, { max: 1 })).toEqual(['lib/a.ts']);
  });
});

describe('ratchet', () => {
  const entry = (score, valid = 60) => ({
    blob: 'b',
    sha: 'a'.repeat(40),
    at: 'x',
    status: 'scored',
    score,
    valid,
    killed: 0,
    survived: 0,
    durationMs: 1,
  });
  it('enforces committed floors', () => {
    const baseline = { files: { 'lib/a.ts': { floor: 70 } } };
    expect(
      ratchetVerdict('lib/a.ts', entry(69.9), undefined, baseline).ok
    ).toBe(false);
    expect(ratchetVerdict('lib/a.ts', entry(70), undefined, baseline).ok).toBe(
      true
    );
  });
  it('without a floor, fails a drop beyond slack on enough mutants only', () => {
    const baseline = { files: {} };
    expect(ratchetVerdict('lib/b.ts', entry(60), entry(80), baseline).ok).toBe(
      false
    );
    expect(
      ratchetVerdict('lib/b.ts', entry(79.5), entry(80), baseline).ok
    ).toBe(true);
    expect(
      ratchetVerdict(
        'lib/b.ts',
        entry(10, MIN_RATCHET_VALID - 1),
        entry(80),
        baseline
      ).ok
    ).toBe(true);
  });
  it('proposes baseline floors that pass the existing baseline validator', () => {
    const state = emptyState();
    recordRun(state, 'lib/a.ts', {
      blob: 'b',
      sha: 'c'.repeat(40),
      at: 'x',
      durationMs: 5,
      mutants: [
        ...Array(40)
          .fill(0)
          .map(() => ({ status: 'Killed' })),
        ...Array(10)
          .fill(0)
          .map(() => ({ status: 'Survived' })),
      ],
    });
    recordRun(state, 'lib/tiny.ts', {
      blob: 'b',
      sha: null,
      at: 'x',
      durationMs: 5,
      mutants: [{ status: 'Killed' }],
    });
    const proposal = proposeBaselineEntries(
      state,
      { files: {} },
      { runId: 7, sha: 'd'.repeat(40) }
    );
    expect(Object.keys(proposal)).toEqual(['lib/a.ts']);
    expect(proposal['lib/a.ts']).toMatchObject({
      measured: 80,
      floor: 79,
      valid: 50,
    });
    expect(
      validateMutationScoreBaseline({
        schemaVersion: 1,
        direction: 'lock_up',
        files: proposal,
      })
    ).toEqual([]);
  });
});

describe('spare-compute contract', () => {
  it('preflight reports no problems or plain strings', () => {
    expect(Array.isArray(preflight(REPO_ROOT))).toBe(true);
  });
});

describe('baseline shards', () => {
  it('parses an index/count pair and rejects out-of-range or malformed values', () => {
    expect(parseShard('3/40')).toEqual({ index: 3, count: 40 });
    expect(parseShard('0/1')).toEqual({ index: 0, count: 1 });
    for (const bad of ['40/40', '-1/4', '1/0', '2', 'a/b', '1/4/2'])
      expect(() => parseShard(bad)).toThrow(/--shard/u);
  });

  it('puts every module in exactly one shard, stably', () => {
    const files = Array.from({ length: 500 }, (_, i) => `lib/m${i}.ts`);
    const counts = new Array(8).fill(0);
    for (const file of files) {
      const shard = shardOf(file, 8);
      expect(shard).toBe(shardOf(file, 8));
      expect(shard).toBeGreaterThanOrEqual(0);
      expect(shard).toBeLessThan(8);
      counts[shard] += 1;
    }
    expect(counts.reduce((a, b) => a + b, 0)).toBe(500);
    // A hash split, not one bucket: every shard gets real work.
    for (const n of counts) expect(n).toBeGreaterThan(30);
  });

  it('merges shard states keeping the newest entry per module', () => {
    const entry = (at, score) => ({ at, score, status: 'scored' });
    const a = {
      ...emptyState(),
      modules: {
        'lib/a.ts': entry('2026-11-01T00:00:00Z', 50),
        'lib/b.ts': entry('2026-11-03T00:00:00Z', 70),
      },
    };
    const b = {
      ...emptyState(),
      modules: {
        'lib/a.ts': entry('2026-11-02T00:00:00Z', 60),
        'lib/b.ts': entry('2026-11-02T00:00:00Z', 10),
        'lib/c.ts': entry('2026-11-02T00:00:00Z', 80),
      },
    };
    const merged = mergeStates(a, b, { schemaVersion: 99, modules: {} });
    expect(merged.schemaVersion).toBe(emptyState().schemaVersion);
    expect(
      Object.fromEntries(
        Object.entries(merged.modules).map(([k, v]) => [k, v.score])
      )
    ).toEqual({ 'lib/a.ts': 60, 'lib/b.ts': 70, 'lib/c.ts': 80 });
  });

  it('keeps top-level fields from the first state that has them', () => {
    const merged = mergeStates(
      { ...emptyState(), modelFingerprint: 'f1', modelIds: ['m1'] },
      { ...emptyState(), modelFingerprint: 'f2', note: 'shard' }
    );
    expect(merged).toEqual({
      ...emptyState(),
      modelFingerprint: 'f1',
      modelIds: ['m1'],
      note: 'shard',
    });
  });
});

describe('selectPool', () => {
  const candidates = ['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts'].map(
    file => ({ file, blob: `${file}@2`, testCount: 1 })
  );
  const state = {
    modules: {
      'lib/a.ts': { blob: 'lib/a.ts@1' },
      'lib/b.ts': { blob: 'lib/b.ts@2' },
    },
  };

  it('keeps every candidate in sweep mode and only changed scored ones in incremental', () => {
    expect(selectPool(candidates, state, { mode: 'sweep' })).toEqual(
      candidates
    );
    expect(
      selectPool(candidates, state, { mode: 'incremental' }).map(c => c.file)
    ).toEqual(['lib/a.ts']);
  });

  it('splits the pool into disjoint shards that cover it', () => {
    const files = [0, 1, 2].flatMap(index =>
      selectPool(candidates, state, { mode: 'sweep', shard: `${index}/3` }).map(
        c => c.file
      )
    );
    expect(files.sort()).toEqual(candidates.map(c => c.file));
  });
});
