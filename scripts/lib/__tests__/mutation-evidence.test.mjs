import { describe, expect, it } from 'vitest';
import {
  finalizeEvidenceEntry,
  proposeEvidenceFloors,
  shouldPark,
  strongerHighWater,
} from '../mutation-evidence.mjs';
import { mergeStates } from '../mutation-sweep.mjs';
import { recordEvidenceAttempt } from '../mutation-sweep-attempt.mjs';

const file = 'lib/control.ts';
const configDigest = 'fixture-config';
const baseline = { files: {} };
const sample = score => ({
  status: 'scored',
  score,
  valid: 40,
  killed: score * 0.4,
  survived: (100 - score) * 0.4,
  sha: 'a'.repeat(40),
  at: '2026-11-16T00:00:00.000Z',
  blob: 'preserved',
  durationMs: 200,
});
const run = (score, previous, options = {}, changes = {}) =>
  finalizeEvidenceEntry({
    file,
    entry: { ...sample(score), ...changes },
    previous,
    baseline,
    configDigest,
    runId: 1,
    ...options,
  });
const proposals = (entry, source = {}, floor = 0) =>
  proposeEvidenceFloors(
    { modules: { [file]: entry } },
    { files: { [file]: { floor } } },
    { runId: 1, configDigest, ...source }
  );

const attempt = (mutants, options = {}) =>
  recordEvidenceAttempt({
    state: { modules: {} },
    file,
    blob: 'a',
    sha: 'a'.repeat(40),
    at: '2026-11-16',
    durationMs: 1,
    mutants,
    partialMutants: null,
    source: 'true',
    tests: [],
    baseline,
    equivalents: { entries: [] },
    configDigest,
    runId: 1,
    timedOut: false,
    unchanged: true,
    error: null,
    receipt: { schemaVersion: 1, configDigest },
    previous: undefined,
    ...options,
  });

describe('mutation evidence ratchet', () => {
  it('retains high-water through repeated regressions and sub-point drift', () => {
    let entry = run(90).entry;
    const original = entry.highWater;
    for (const score of [80, 80, 89.5, 89, 88.5, 0]) {
      const result = run(score, entry);
      expect(result.verdict.status).toBe('regression');
      expect(result.entry.highWater).toEqual(original);
      entry = result.entry;
    }
    const improved = run(95, entry);
    expect(improved.verdict.status).toBe('pass');
    expect(improved.entry).toMatchObject({
      blob: 'preserved',
      durationMs: 200,
      valid: 40,
      killed: 38,
      highWater: { score: 95 },
    });
    expect(original.score).toBe(90);
  });

  it.each([
    ...['error', 'untested', 'stale'].map(status => ({ status })),
    ...[null, Number.NaN, Number.POSITIVE_INFINITY].map(score => ({ score })),
    { valid: 0 },
    { unknown: 1 },
    { complete: false },
    { sha: null },
    { at: 'invalid' },
  ])('keeps incomplete evidence unknown: %j', changes => {
    const initial = run(90).entry;
    const result = run(100, initial, {}, changes);
    expect(result.verdict).toMatchObject({ status: 'unknown', ok: null });
    expect(result.entry.highWater).toEqual(initial.highWater);
    expect(proposals(result.entry)).toEqual({});
  });

  it('holds config changes across repeats and ignores unbound legacy scores', () => {
    const initial = run(90).entry;
    let entry = initial;
    for (const runId of [2, 3]) {
      const result = run(100, entry, { runId, configDigest: 'new' });
      expect(result.verdict).toMatchObject({ status: 'unknown', ok: null });
      expect(result.entry.highWater).toEqual(initial.highWater);
      entry = result.entry;
    }
    expect(run(90, entry).verdict.status).toBe('pass');
    expect(run(80, sample(100)).entry.highWater.score).toBe(80);
  });

  it('keeps the strongest compatible mark when a newer baseline replaces the module', () => {
    const older = run(90).entry;
    const newer = run(95).entry;
    const merged = /** @type {any} */ (
      mergeStates(
        {
          schemaVersion: 1,
          highWater: { [file]: older.highWater },
          modules: { [file]: { ...older, at: '2026-11-15' } },
        },
        { schemaVersion: 1, modules: { [file]: newer } }
      )
    );
    const previous = {
      ...merged.modules[file],
      highWater: strongerHighWater(
        merged.highWater[file],
        merged.modules[file].highWater
      ),
    };
    const result = run(92, previous);
    expect(result.verdict.status).toBe('regression');
    expect(result.entry.highWater.score).toBe(95);
    expect(
      strongerHighWater(older.highWater, {
        ...newer.highWater,
        configDigest: 'other',
      })
    ).toEqual(older.highWater);
  });

  it('enforces floors for small samples and config changes', () => {
    const initial = run(90).entry;
    const options = { baseline: { files: { [file]: { floor: 85 } } } };
    expect(run(80, initial, options, { valid: 2 }).verdict.status).toBe(
      'regression'
    );
    expect(
      run(80, initial, { ...options, configDigest: 'new' }).verdict.status
    ).toBe('regression');
    expect(run(85, undefined, options, { valid: 2 }).verdict.status).toBe(
      'pass'
    );
    const small = run(100, undefined, {}, { valid: 29 });
    expect(small.verdict.status).toBe('unknown');
    expect(small.entry.highWater).toBeUndefined();
    expect(proposals(small.entry)).toEqual({});
  });

  it('parks N sweeps and clears parking on a new attempt', () => {
    const initial = run(90).entry;
    const result = run(null, initial, {
      runId: 10,
      timedOut: true,
      parkRuns: 3,
    });
    const parked = result.entry;
    expect(result.verdict.status).toBe('unknown');
    expect(parked.highWater).toEqual(initial.highWater);
    expect(parked.retryAfterRun).toBe(13);
    const decisions = [11, 12, 13, 14].map(id => shouldPark(parked, id));
    expect(decisions).toEqual([true, true, true, false]);
    expect(run(90, parked, { runId: 14 }).entry.retryAfterRun).toBeUndefined();
    expect(shouldPark(undefined, 1)).toBe(false);
    expect(() => run(90, undefined, { runId: 0 })).toThrow('ordinal');
    expect(() => run(90, undefined, { parkRuns: -1 })).toThrow('parkRuns');
  });

  it('proposes upward floors only from current bound passing evidence', () => {
    const entry = run(90).entry;
    expect(proposals(entry, {}, 80)).toEqual({
      [file]: {
        measured: 90,
        floor: 90,
        valid: 40,
        runId: 1,
        sha: 'a'.repeat(40),
      },
    });
    expect(proposals(entry, { runId: 2 })).toEqual({});
    expect(proposals(entry, { configDigest: 'other' })).toEqual({});
    for (const floor of [90, 95])
      expect(proposals(entry, {}, floor)).toEqual({});
    entry.sha = 'b'.repeat(40);
    expect(proposals(entry)).toEqual({});
  });
  it.each([
    {
      mutants: [
        {
          status: 'Survived',
          mutatorName: 'BooleanLiteral',
          location: { start: { line: 1, column: 1 } },
        },
      ],
    },
    {
      mutants: [
        {
          status: 'Survived',
          mutatorName: 'BooleanLiteral',
          location: {
            start: { line: 2, column: 1 },
            end: { line: 1, column: 1 },
          },
        },
      ],
    },
    { mutants: [null] },
    { mutants: [{ status: [] }] },
  ])('persists malformed report data as unknown: %j', ({ mutants }) => {
    const state = { modules: {} };
    const previous = run(90).entry;
    const result = attempt(mutants, { state, previous });
    expect(result.entry).toMatchObject({ status: 'error', score: null });
    expect(result.entry.error).toContain('Invalid mutation report');
    expect(result.verdict).toMatchObject({ status: 'unknown', ok: null });
    expect(result.entry.highWater).toEqual(previous.highWater);
    expect(state.modules[file]).toBe(result.entry);
    expect(result.task).toBeNull();
    expect(proposals(result.entry)).toEqual({});
  });
  it('retains readable counts when survivor extraction fails', () => {
    const result = attempt([
      { status: 'Killed' },
      { status: 'Survived', mutatorName: 'BooleanLiteral' },
    ]);
    expect(result.entry.partial).toEqual({
      total: 2,
      counts: { Killed: 1, Survived: 1 },
    });
    expect(result.entry.score).toBeNull();
    expect(result.task).toBeNull();
  });
  it('does not let malformed partial diagnostic statuses escape attempt recording', () => {
    for (const partialMutants of [[null], { length: 1 }]) {
      const result = attempt(null, { partialMutants, previous: run(90).entry });
      expect(result.verdict.status).toBe('unknown');
      expect(result.entry.error).toContain('Invalid mutation report');
      expect(result.entry.highWater.score).toBe(90);
      expect(result.entry.partial.error).toBeTruthy();
      expect(result.task).toBeNull();
    }
  });
  it('retains a complete small-sample measurement while its ratchet stays unknown', () => {
    const result = attempt(
      Array.from({ length: 5 }, () => ({ status: 'Killed' }))
    );
    expect(result.entry).toMatchObject({
      status: 'scored',
      score: 100,
      valid: 5,
    });
    expect(result.verdict.status).toBe('unknown');
    expect(result.entry.highWater).toBeUndefined();
    expect(proposals(result.entry)).toEqual({});
  });
});
