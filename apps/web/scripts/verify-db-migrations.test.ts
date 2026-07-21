import { describe, expect, it } from 'vitest';
import {
  computeMigrationDrift,
  hashMigrationSql,
} from './verify-db-migrations';

const entry = (idx: number, tag: string, hash: string, when = idx * 1000) => ({
  idx,
  tag,
  when,
  hash,
});

describe('hashMigrationSql', () => {
  it('matches the drizzle-orm migrator hash (sha256 of file contents)', () => {
    // sha256("SELECT 1;") computed independently via `shasum -a 256`
    expect(hashMigrationSql('SELECT 1;')).toBe(
      '17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a'
    );
  });
});

describe('computeMigrationDrift', () => {
  it('reports ok when journal and ledger match', () => {
    const journal = [entry(1, '0001_a', 'h1'), entry(2, '0002_b', 'h2')];
    const applied = [
      { hash: 'h1', created_at: 1000 },
      { hash: 'h2', created_at: 2000 },
    ];

    const report = computeMigrationDrift(journal, applied);

    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.unexpected).toEqual([]);
    expect(report.journalCount).toBe(2);
    expect(report.ledgerCount).toBe(2);
  });

  it('flags journal entries missing from the ledger', () => {
    const journal = [
      entry(1, '0001_a', 'h1'),
      entry(2, '0002_b', 'h2'),
      entry(3, '0003_c', 'h3'),
    ];
    const applied = [{ hash: 'h1', created_at: 1000 }];

    const report = computeMigrationDrift(journal, applied);

    expect(report.ok).toBe(false);
    expect(report.missing.map(m => m.tag)).toEqual(['0002_b', '0003_c']);
    expect(report.unexpected).toEqual([]);
  });

  it('flags ledger rows that match no journal entry', () => {
    const journal = [entry(1, '0001_a', 'h1')];
    const applied = [
      { hash: 'h1', created_at: 1000 },
      { hash: 'stale', created_at: 999 },
    ];

    const report = computeMigrationDrift(journal, applied);

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([]);
    expect(report.unexpected).toEqual([{ hash: 'stale', created_at: 999 }]);
  });

  it('handles interleaved drift like the 2026-07 dev DB incident', () => {
    // 0033/0034 applied out of band: journal has them, ledger skips them.
    const journal = [
      entry(32, '0032_tricky_thing', 'h32'),
      entry(33, '0033_wet_zzzax', 'h33'),
      entry(34, '0034_youthful_white_queen', 'h34'),
      entry(35, '0035_tranquil_stephen_strange', 'h35'),
    ];
    const applied = [
      { hash: 'h32', created_at: 32000 },
      { hash: 'h35', created_at: 35000 },
    ];

    const report = computeMigrationDrift(journal, applied);

    expect(report.ok).toBe(false);
    expect(report.missing.map(m => m.tag)).toEqual([
      '0033_wet_zzzax',
      '0034_youthful_white_queen',
    ]);
  });
});
