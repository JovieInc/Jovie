import { describe, expect, it } from 'vitest';
import {
  COMPANY_HISTORY_ALIASES_PER_REQUEST,
  COMPANY_HISTORY_MAX_REQUESTS_PER_SYNC,
  type DailySeries,
  decodeDailyCount,
  encodeDailyCount,
  expiredDates,
  isFinalObservation,
  isHistoryDate,
  MERGED_PR_SCOPES,
  type MergedPrScope,
  mergedPrSearchQuery,
  pacificDate,
  pacificDayBounds,
  planMergedPrSync,
  shiftDate,
  summarizeWindow,
  windowDates,
} from './contract';

// 2026-11-08 12:40 PST (20:40Z).
const NOW = Date.parse('2026-11-08T20:40:00Z');

function seriesOf(counts: Record<string, number>, final = true): DailySeries {
  return Object.fromEntries(
    Object.entries(counts).map(([date, count]) => [
      date,
      { date, count, final, observedAt: '2026-11-08T20:00:00.000Z' },
    ])
  );
}

const emptyStore = () =>
  Object.fromEntries(MERGED_PR_SCOPES.map(s => [s, {}])) as Record<
    MergedPrScope,
    DailySeries
  >;

describe('Pacific days', () => {
  it('buckets instants by Los Angeles calendar date', () => {
    expect(pacificDate(NOW)).toBe('2026-11-08');
    expect(pacificDate(Date.parse('2026-11-09T07:59:59Z'))).toBe('2026-11-08');
    expect(pacificDate(Date.parse('2026-11-09T08:00:00Z'))).toBe('2026-11-09');
  });

  it('gives 24h days in winter and 25h on the November DST change', () => {
    const winter = pacificDayBounds('2026-11-08');
    expect(new Date(winter.startMs).toISOString()).toBe(
      '2026-11-08T08:00:00.000Z'
    );
    expect(winter.endMs - winter.startMs).toBe(24 * 3_600_000);
    const fallBack = pacificDayBounds('2026-11-01');
    expect(new Date(fallBack.startMs).toISOString()).toBe(
      '2026-11-01T07:00:00.000Z'
    );
    expect(fallBack.endMs - fallBack.startMs).toBe(25 * 3_600_000);
    const springForward = pacificDayBounds('2026-03-08');
    expect(springForward.endMs - springForward.startMs).toBe(23 * 3_600_000);
  });

  it('shifts and lists dates oldest first', () => {
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
    expect(windowDates('2026-11-08', 3)).toEqual([
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(isHistoryDate('2026-02-30')).toBe(false);
    expect(isHistoryDate('2026-02-28')).toBe(true);
  });
});

describe('mergedPrSearchQuery', () => {
  it('matches the shipping card query family with inclusive day bounds', () => {
    expect(mergedPrSearchQuery('JovieInc', 'org', '2026-11-08')).toBe(
      'org:JovieInc is:pr is:merged merged:2026-11-08T08:00:00Z..2026-11-09T07:59:59Z'
    );
    expect(mergedPrSearchQuery('JovieInc', 'summer-config', '2026-11-08')).toBe(
      'repo:JovieInc/summer-config is:pr is:merged merged:2026-11-08T08:00:00Z..2026-11-09T07:59:59Z'
    );
  });
});

describe('finality', () => {
  it('marks a day final an hour after it ends', () => {
    const { endMs } = pacificDayBounds('2026-11-07');
    expect(isFinalObservation('2026-11-07', endMs + 59 * 60_000)).toBe(false);
    expect(isFinalObservation('2026-11-07', endMs + 60 * 60_000)).toBe(true);
  });
});

describe('planMergedPrSync', () => {
  const budget =
    COMPANY_HISTORY_ALIASES_PER_REQUEST * COMPANY_HISTORY_MAX_REQUESTS_PER_SYNC;

  it('backfills newest first within the per-run budget', () => {
    const plan = planMergedPrSync(NOW, emptyStore());
    expect(plan).toHaveLength(budget);
    expect(plan[0]).toEqual({ scope: 'org', date: '2026-11-08' });
    expect(plan[3]).toEqual({ scope: 'summer-config', date: '2026-11-08' });
    expect(plan.at(-1)?.date).toBe(shiftDate('2026-11-08', -(budget / 4 - 1)));
  });

  it('refetches only today, yesterday and non-final days once warm', () => {
    const store = emptyStore();
    const dates = windowDates('2026-11-08', 120);
    for (const scope of MERGED_PR_SCOPES) {
      store[scope] = seriesOf(Object.fromEntries(dates.map(d => [d, 5])));
    }
    store.org = {
      ...store.org,
      '2026-10-20': { ...store.org['2026-10-20']!, final: false },
    };
    const plan = planMergedPrSync(NOW, store);
    expect(plan).toEqual([
      ...MERGED_PR_SCOPES.map(scope => ({ scope, date: '2026-11-08' })),
      ...MERGED_PR_SCOPES.map(scope => ({ scope, date: '2026-11-07' })),
      { scope: 'org', date: '2026-10-20' },
    ]);
  });
});

describe('summarizeWindow', () => {
  const counts = Object.fromEntries(
    windowDates('2026-11-08', 14).map((date, i) => [date, i + 1])
  );

  it('totals the window, the window before and the change', () => {
    const summary = summarizeWindow(seriesOf(counts), NOW, 7);
    expect(summary.from).toBe('2026-11-02');
    expect(summary.to).toBe('2026-11-08');
    // 8..14 vs 1..7
    expect(summary.total).toBe(77);
    expect(summary.priorTotal).toBe(28);
    expect(summary.changePercent).toBe(175);
    // Full days 8..13 average 10.5; today is partial.
    expect(summary.averagePerFullDay).toBe(10.5);
    expect(summary.best).toEqual({ date: '2026-11-08', count: 14 });
    expect(summary.complete).toBe(true);
  });

  it('never zero-fills a missing day', () => {
    const { ['2026-11-05']: _missing, ...rest } = counts;
    const summary = summarizeWindow(seriesOf(rest), NOW, 7);
    expect(summary.total).toBeNull();
    expect(summary.complete).toBe(false);
    expect(summary.points.find(p => p.date === '2026-11-05')?.count).toBeNull();
    expect(summary.changePercent).toBeNull();
  });
});

describe('stored values', () => {
  it('round-trips and rejects malformed values', () => {
    const value = {
      date: '2026-11-08',
      count: 97,
      final: false,
      observedAt: '2026-11-08T20:00:00.000Z',
    };
    expect(decodeDailyCount('2026-11-08', encodeDailyCount(value))).toEqual(
      value
    );
    expect(decodeDailyCount('2026-11-08', { c: -1, o: value.observedAt })).toBe(
      null
    );
    expect(decodeDailyCount('nope', encodeDailyCount(value))).toBeNull();
    expect(decodeDailyCount('2026-11-08', '{bad')).toBeNull();
  });

  it('lists dates past retention for trimming', () => {
    expect(
      expiredDates(NOW, ['2026-11-08', '2026-07-12', '2026-07-11', 'junk'])
    ).toEqual(['2026-07-11', 'junk']);
  });
});
