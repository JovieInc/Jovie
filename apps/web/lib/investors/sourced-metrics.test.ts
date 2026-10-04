import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadInvestorSourcedMetrics,
  type SourcedInvestorStat,
  selectInvestorFacingStats,
  sourcedUsdAmount,
} from './sourced-metrics';

const UNSOURCED_STAT =
  /\$\s*\d|\b90M\b|\b25K\b|\b60,000\b|\b99,000\b|\b50,000\b/u;

function markdownFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const info = statSync(path);
    if (info.isDirectory()) {
      files.push(...markdownFiles(path));
    } else if (entry.endsWith('.md')) {
      files.push(path);
    }
  }
  return files;
}

const sourced = (
  overrides: Partial<SourcedInvestorStat> = {}
): SourcedInvestorStat => ({
  id: 'raise_committed_usd',
  label: 'Committed',
  value: '25000',
  unit: 'usd',
  sourceKind: 'stripe',
  sourceLabel: 'Stripe balance transaction',
  observedAt: '2026-10-02',
  ...overrides,
});

describe('selectInvestorFacingStats', () => {
  it('keeps a database, Stripe, or analytics stat with an observation date', () => {
    const snapshot = selectInvestorFacingStats([
      sourced(),
      sourced({
        id: 'profiles',
        label: 'Profiles',
        value: '12',
        unit: 'count',
        sourceKind: 'database',
        sourceLabel: 'profiles table',
        observedAt: '2026-10-01',
      }),
    ]);

    expect(snapshot.stats).toHaveLength(2);
    expect(snapshot.asOf).toBe('2026-10-02');
    expect(sourcedUsdAmount(snapshot, 'raise_committed_usd')).toBe(25000);
  });

  it('drops a stat with no accepted source, date, or amount', () => {
    const snapshot = selectInvestorFacingStats([
      sourced({
        sourceKind: 'spreadsheet' as SourcedInvestorStat['sourceKind'],
      }),
      sourced({ observedAt: 'October 2' }),
      sourced({ value: '  ' }),
      sourced({ sourceLabel: '' }),
    ]);

    expect(snapshot).toEqual({ asOf: null, stats: [] });
    expect(sourcedUsdAmount(snapshot, 'raise_committed_usd')).toBeNull();
  });

  it('loads no company stats until an adapter records one', () => {
    expect(loadInvestorSourcedMetrics()).toEqual({ asOf: null, stats: [] });
  });
});

describe('investor markdown', () => {
  it('does not carry hand-typed raise, stream, or market counts', () => {
    const roots = [
      join(process.cwd(), 'content/investors'),
      join(process.cwd(), '../../content/investors/deck'),
    ];

    const offenders = roots.flatMap(root =>
      markdownFiles(root)
        .map(path => ({ path, text: readFileSync(path, 'utf8') }))
        .filter(file => UNSOURCED_STAT.test(file.text))
        .map(file => file.path)
    );

    expect(offenders).toEqual([]);
  });
});
