import { describe, expect, it } from 'vitest';
import { buildReport, stageMarkdown } from '../../shipping-slo-report.mjs';
import {
  appendDailyHistory,
  DEFAULT_THRESHOLDS,
  HISTORY_DAYS,
  leadTimeByProvider,
  METRIC_DEFS,
  prProvider,
  stageHistorySummary,
  validateBaseline,
} from '../shipping-slo.mjs';

const NOW = Date.parse('2026-09-28T00:00:00Z');
const DAY = 86_400_000;
const ago = days => new Date(NOW - days * DAY).toISOString();

const baseline = metrics => ({
  schemaVersion: 1,
  thresholds: { ...DEFAULT_THRESHOLDS },
  metrics,
  history: [],
});

const seedBaseline = () =>
  baseline(
    Object.fromEntries(
      METRIC_DEFS.filter(d => !d.unsupported).map(d => [
        d.key,
        { value: 100, unit: d.unit, direction: d.direction },
      ])
    )
  );

describe('prProvider + leadTimeByProvider', () => {
  it('classifies providers from branch prefix only, leaving unmapped lanes in other', () => {
    expect(prProvider({ headRefName: 'hyperagent/jov-1-x' })).toBe(
      'hyperagent'
    );
    expect(prProvider({ headRefName: 'GLM/feature' })).toBe('glm');
    expect(prProvider({ headRefName: 'devin/jov-2' })).toBe('devin');
    expect(prProvider({ headRefName: 'devin-ai-integration/x' })).toBe('devin');
    expect(prProvider({ headRefName: 'codex/thing' })).toBe('codex');
    // No gem/* branches exist in the repo — Gem stays unattributed.
    expect(prProvider({ headRefName: 'gem/some-lane' })).toBe('other');
    expect(prProvider({ headRefName: 'tim/feature' })).toBe('other');
    expect(prProvider({ headRefName: 'main' })).toBe('other');
    expect(prProvider({})).toBe('other');
  });

  it('groups lead time by provider without changing the ratchet lanes', () => {
    const prs = [
      {
        headRefName: 'hyperagent/a',
        createdAt: ago(2),
        mergedAt: ago(1),
      },
      { headRefName: 'glm/b', createdAt: ago(3), mergedAt: ago(1) },
    ];
    const out = leadTimeByProvider(prs, NOW - 7 * DAY, NOW);
    expect(out.hyperagent.p95).toBe(DAY / 1000);
    expect(out.glm.p95).toBe((2 * DAY) / 1000);
    expect(out.other).toBeUndefined();
  });
});

describe('stageHistorySummary', () => {
  it('collects 7d stage and declared end-to-end pairs as n/p50/p95', () => {
    const summary = stageHistorySummary({
      entities: {
        shipping: {
          stages: {
            'ci-run': { '7d': { n: 5, p50: 10, p95: 20 } },
            terminal: { terminal: true, '7d': { n: 5, p50: null, p95: null } },
          },
          endToEnd: {
            'ci-run->merged': { '7d': { n: 4, p50: 100, p95: 200 } },
          },
        },
      },
    });
    expect(summary).toEqual({
      'shipping:ci-run': { n: 5, p50: 10, p95: 20 },
      'shipping:terminal': { n: 5, p50: null, p95: null },
      'shipping:ci-run->merged': { n: 4, p50: 100, p95: 200 },
    });
  });

  it('is empty without timings', () => {
    expect(stageHistorySummary(null)).toEqual({});
  });
});

describe('appendDailyHistory', () => {
  const baseReport = () => ({
    generatedAt: '2026-09-28T00:00:00Z',
    flat: {
      'ci_walltime.pull_request.p95': 600,
      'throughput.merges_per_day': 25,
      'skip_me.nonfinite': Number.NaN,
    },
    prsPerHour: { last24h: 1.5, from7d: 1.1 },
    stageTimings: {
      entities: {
        shipping: {
          stages: { 'ci-run': { '7d': { n: 5, p50: 10, p95: 20 } } },
          endToEnd: {},
        },
      },
    },
    metrics: {
      leadTimeByProvider: {
        hyperagent: { n: 3, p50: 100, p95: 200 },
      },
      throughput: {
        wowGrowth: 0.12,
        growthTrend: 'accelerating',
        mergesPerDay: 25,
        verifiedPerDay: 20,
      },
    },
  });

  it('appends one rich daily row without touching metric baselines', () => {
    const seed = seedBaseline();
    const before = JSON.stringify(seed.metrics);
    const next = appendDailyHistory(seed, baseReport(), { now: NOW });
    expect(next.metrics).toBe(seed.metrics); // same reference: never rewritten
    expect(JSON.stringify(next.metrics)).toBe(before);
    expect(next.updatedAt).toBe(seed.updatedAt); // no implied ratchet
    expect(next.historyUpdatedAt).toBe('2026-09-28T00:00:00.000Z');
    expect(validateBaseline(next).ok).toBe(true);
    const row = next.history.at(-1);
    expect(row.date).toBe('2026-09-28');
    expect(row.values).toEqual({
      'ci_walltime.pull_request.p95': 600,
      'throughput.merges_per_day': 25,
    }); // non-finite flat keys are dropped
    expect(row.prsPerHour).toEqual({ last24h: 1.5, from7d: 1.1 });
    expect(row.stages['shipping:ci-run']).toEqual({ n: 5, p50: 10, p95: 20 });
    expect(row.leadTimeByProvider.hyperagent).toEqual({
      n: 3,
      p50: 100,
      p95: 200,
    });
    expect(row.throughput).toEqual({
      wowGrowth: 0.12,
      growthTrend: 'accelerating',
      mergesPerDay: 25,
      verifiedPerDay: 20,
    });
  });

  it('replaces a same-day row and caps history at HISTORY_DAYS', () => {
    const seed = seedBaseline();
    seed.history = Array.from({ length: HISTORY_DAYS }, (_, i) => ({
      date: `day-${i}`,
      values: {},
    }));
    seed.history[3] = {
      date: '2026-09-28',
      values: { stale: true },
    };
    const next = appendDailyHistory(seed, baseReport(), { now: NOW });
    expect(next.history).toHaveLength(HISTORY_DAYS);
    expect(next.history.filter(h => h.date === '2026-09-28')).toHaveLength(1);
    expect(next.history.at(-1).values['ci_walltime.pull_request.p95']).toBe(
      600
    );
    expect(next.history.some(h => h.values?.stale)).toBe(false);
  });

  it('accepts a bare report (no stages, no provider data) without throwing', () => {
    const next = appendDailyHistory(seedBaseline(), { flat: {} }, { now: NOW });
    expect(next.history.at(-1)).toMatchObject({
      date: '2026-09-28',
      values: {},
      prsPerHour: { last24h: null, from7d: null },
      stages: {},
      leadTimeByProvider: {},
    });
  });

  it('exposes prsPerHour and provider lead time on buildReport output', () => {
    const report = buildReport(
      {
        runs: { pull_request: [], merge_group: [], main: [] },
        mergedPrs: [
          {
            number: 1,
            title: 'x',
            headRefName: 'hyperagent/x',
            createdAt: ago(3),
            mergedAt: ago(2),
            mergeCommitSha: 'abc',
          },
        ],
        timelines: {},
        deployments: [],
      },
      seedBaseline(),
      { now: NOW }
    );
    expect(report.prsPerHour).toEqual({ last24h: 0, from7d: 1 / 168 });
    expect(report.gistSlo.leadTimeByProvider.hyperagent.n).toBe(1);
    expect(report.metrics.leadTimeByProvider.hyperagent.n).toBe(1);
  });
});

describe('stage source diagnostics', () => {
  it('does not label healthy sources partial just because they carry counts', () => {
    const sources = {
      'linear-history': { ok: true, n: 1, counts: { fetched: 1, failed: 0 } },
    };
    expect(stageMarkdown({ entities: {}, sources }).join('\n')).not.toContain(
      'Stage sources partial'
    );
  });
  it('renders incomplete source counts next to retained data', () => {
    const sources = {
      'linear-history': {
        ok: true,
        n: 50,
        partial: true,
        counts: { fetched: 50, failed: 1 },
      },
    };
    expect(stageMarkdown({ entities: {}, sources }).join('\n')).toContain(
      'linear-history (1 failed batch(es))'
    );
  });
});
