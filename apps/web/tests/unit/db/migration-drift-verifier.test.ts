import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMocks = vi.hoisted(() => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const end = vi.fn().mockResolvedValue(undefined);
  return { query, end };
});

vi.mock('@neondatabase/serverless', () => {
  class MockPool {
    query = poolMocks.query;
    end = poolMocks.end;
  }
  return {
    neonConfig: { webSocketConstructor: undefined },
    Pool: MockPool,
  };
});

import {
  computeMigrationDrift,
  planLedgerRepair,
  repairLedger,
} from '@/scripts/verify-db-migrations';

const journal = [
  { idx: 0, tag: '0000_baseline', when: 1, hash: 'baseline-hash' },
  { idx: 1, tag: '0001_guard', when: 2, hash: 'guard-hash' },
];

describe('migration drift verifier', () => {
  beforeEach(() => {
    poolMocks.query.mockClear();
    poolMocks.end.mockClear();
  });

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

  it('repairs the ledger with journal-hash inserts, then closes the pool', async () => {
    const drift = computeMigrationDrift(journal, [
      { hash: 'baseline-hash', created_at: 1 },
      { hash: 'rewritten-hash', created_at: 2 },
    ]);

    await repairLedger('postgres://ephemeral', journal, drift);

    expect(poolMocks.query.mock.calls).toEqual([
      [
        'DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1',
        ['rewritten-hash'],
      ],
      [
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        ['guard-hash', 2],
      ],
    ]);
    expect(poolMocks.end).toHaveBeenCalledOnce();
  });

  it('still closes the pool when the plan has no writes', async () => {
    const drift = computeMigrationDrift(journal, [
      { hash: 'baseline-hash', created_at: 1 },
      { hash: 'guard-hash', created_at: 2 },
    ]);

    await repairLedger('postgres://ephemeral', journal, drift);

    expect(poolMocks.query).not.toHaveBeenCalled();
    expect(poolMocks.end).toHaveBeenCalledOnce();
  });
});
