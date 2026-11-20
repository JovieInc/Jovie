import { describe, expect, it } from 'vitest';
import {
  loadSourceGuardHistory,
  orderSourceGuardsByFailureRate,
  SOURCE_GUARD_HISTORY_SCHEMA,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';

const guard = id => ({ id, command: `node ${id}.mjs` });
const ids = guards => guards.map(guard => guard.id);
const entries = spec =>
  Object.fromEntries(
    Object.entries(spec).map(([id, entry]) => [id, { ...entry }])
  );

describe('source-guard cheap-first scheduler (JOV-13111)', () => {
  it('a rarely-failing slow guard still runs, ordered after cheap failers', () => {
    const guards = [
      guard('slow-rare'),
      guard('cheap-frequent'),
      guard('no-data'),
    ];
    const ordered = orderSourceGuardsByFailureRate(
      guards,
      entries({
        // ~1 failure per 40 runs over ~200s: tiny score.
        'slow-rare': { failures: 1, runs: 40, durationMs: 200_000 },
        // 1 failure in 10 runs in ~2s: huge score.
        'cheap-frequent': { failures: 1, runs: 10, durationMs: 2_000 },
      })
    );
    expect(ids(ordered)).toEqual(['cheap-frequent', 'slow-rare', 'no-data']);
    // Run-all semantics: nothing is dropped.
    expect(ordered).toHaveLength(3);
    expect(ordered.find(({ id }) => id === 'slow-rare')).toBeDefined();
  });

  it('a cheap frequently-failing guard reports first', () => {
    const guards = [guard('big-suite'), guard('cheap-check')];
    expect(
      ids(
        orderSourceGuardsByFailureRate(
          guards,
          entries({
            'big-suite': { failures: 1, runs: 20, durationMs: 300_000 },
            'cheap-check': { failures: 1, runs: 20, durationMs: 1_000 },
          })
        )
      )
    ).toEqual(['cheap-check', 'big-suite']);
    // Equal fail-probability per second keeps manifest order (stable tie).
    expect(
      ids(
        orderSourceGuardsByFailureRate(
          guards,
          entries({
            'big-suite': { failures: 1, runs: 20, durationMs: 5_000 },
            'cheap-check': { failures: 1, runs: 20, durationMs: 5_000 },
          })
        )
      )
    ).toEqual(['big-suite', 'cheap-check']);
  });

  it('absent or schema-wrong history falls back to manifest order, all guards kept', () => {
    const guards = [guard('b'), guard('a'), guard('c')];
    for (const absent of [null, undefined, { schema: 'wrong/v1' }, {}]) {
      const ordered = orderSourceGuardsByFailureRate(guards, absent);
      expect(ordered).toEqual(guards);
      expect(ordered).toHaveLength(3);
    }
    // Partial absence: unknown guards keep manifest order after data-backed ones.
    expect(
      ids(
        orderSourceGuardsByFailureRate(
          guards,
          entries({ c: { failures: 1, runs: 5, durationMs: 1_000 } })
        )
      )
    ).toEqual(['c', 'b', 'a']);
  });

  it('selectSourceGuards keeps run-all selection and applies the committed ledger', () => {
    const all = selectSourceGuards('', null);
    const manifest = selectSourceGuards('', null);
    // Deterministic: identical inputs give an identical order.
    expect(ids(all)).toEqual(ids(manifest));
    // Every guard is still selected and unique.
    expect(new Set(ids(all)).size).toBe(all.length);
    const ledger = loadSourceGuardHistory();
    // The committed ledger is schema-valid (possibly empty): the deterministic
    // fallback makes it equivalent to manifest order.
    if (ledger === null) return;
    expect(ids(orderSourceGuardsByFailureRate(all, ledger))).toEqual(ids(all));
  });

  it('loadSourceGuardHistory tolerates missing or malformed ledgers', () => {
    expect(SOURCE_GUARD_HISTORY_SCHEMA).toBe('jovie.source-guard-history/v1');
    // The committed file parses to the schema shape.
    const parsed = loadSourceGuardHistory();
    expect(parsed === null || typeof parsed === 'object').toBe(true);
    // Malformed and schema-wrong ledgers degrade to null (manifest order).
    expect(loadSourceGuardHistory(() => 'not json')).toBeNull();
    expect(
      loadSourceGuardHistory(() => JSON.stringify({ schema: 'other/v9' }))
    ).toBeNull();
    expect(
      loadSourceGuardHistory(() => {
        throw new Error('ENOENT');
      })
    ).toBeNull();
  });
});
