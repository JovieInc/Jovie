import { describe, expect, it } from 'vitest';
import {
  computeMigrationDrift,
  planLedgerRepair,
} from '@/scripts/verify-db-migrations';

const journal = [
  { idx: 0, tag: '0000_baseline', when: 1, hash: 'baseline-hash' },
  { idx: 1, tag: '0001_guard', when: 2, hash: 'guard-hash' },
];

describe('migration drift verifier', () => {
  it('accepts the immutable journal and matching prior-release ledger', () => {
    expect(
      computeMigrationDrift(journal, [
        { hash: 'baseline-hash', created_at: 1 },
        { hash: 'guard-hash', created_at: 2 },
      ])
    ).toMatchObject({ ok: true, missing: [], unexpected: [] });
  });

  it('rejects a missing guard and an unexpected rewritten migration', () => {
    const drift = computeMigrationDrift(journal, [
      { hash: 'baseline-hash', created_at: 1 },
      { hash: 'rewritten-hash', created_at: 2 },
    ]);

    expect(drift.ok).toBe(false);
    expect(drift.missing.map(entry => entry.tag)).toEqual(['0001_guard']);
    expect(drift.unexpected.map(entry => entry.hash)).toEqual([
      'rewritten-hash',
    ]);
  });

  it('plans a ledger-only repair: drop rewritten rows, reinsert file hashes', () => {
    const drift = computeMigrationDrift(journal, [
      { hash: 'baseline-hash', created_at: 1 },
      { hash: 'rewritten-hash', created_at: 2 },
    ]);
    const plan = planLedgerRepair(journal, drift);

    expect(plan.deleteRows.map(row => row.hash)).toEqual(['rewritten-hash']);
    expect(plan.insertRows).toEqual([
      { hash: 'guard-hash', created_at: 2, tag: '0001_guard' },
    ]);
  });

  it('plans no writes when the ledger already matches the journal', () => {
    const drift = computeMigrationDrift(journal, [
      { hash: 'baseline-hash', created_at: 1 },
      { hash: 'guard-hash', created_at: 2 },
    ]);
    const plan = planLedgerRepair(journal, drift);

    expect(plan.deleteRows).toEqual([]);
    expect(plan.insertRows).toEqual([]);
  });
});
