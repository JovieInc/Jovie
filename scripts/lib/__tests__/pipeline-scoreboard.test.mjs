import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildDailyBriefingContext } from '../../hermes/jobs/daily-briefing.ts';
import {
  buildPipelineScoreboard,
  buildSymphonyThroughputReceipt,
  dailyWindow,
  evaluatePipelineAlarms,
  fetchMergedPrEvidence,
  filterMergedPrEvidence,
  last12HoursWindow,
  readLatestScoreboard,
  renderPipelineScoreboard,
} from '../../hermes/lib/pipeline-scoreboard.ts';

function issue(number, labels) {
  return {
    number,
    title: `Issue ${number}`,
    body: '',
    url: `https://github.com/JovieInc/Jovie/issues/${number}`,
    labels: labels.map(name => ({ name })),
  };
}

function mergedPr(
  number,
  mergedAt,
  createdAt = mergedAt,
  labels = [],
  headRefName = `codex/pr-${number}`,
  baseRefName = 'main'
) {
  return {
    number,
    title: `PR ${number}`,
    headRefName,
    baseRefName,
    mergedAt,
    createdAt,
    updatedAt: mergedAt,
    labels: {
      totalCount: labels.length,
      nodes: labels.map(name => ({ name })),
    },
  };
}

function normalizedMergedPr(...args) {
  const pr = mergedPr(...args);
  return { ...pr, labels: pr.labels.nodes };
}

function searchPage(
  nodes,
  { totalCount = nodes.length, hasNextPage = false, endCursor = null } = {}
) {
  return {
    totalCount,
    pageInfo: { hasNextPage, endCursor },
    nodes,
  };
}

const completeEvidence = { complete: true, reason: null, pages: 1 };

/**
 * @param {import('../../hermes/lib/pipeline-scoreboard.ts').PipelineScoreboardWindow} window
 * @returns {import('../../hermes/lib/pipeline-scoreboard.ts').SymphonyThroughputReceipt}
 */
function insufficientSymphony(window) {
  return {
    schemaVersion: 1,
    window,
    evidence: { complete: false, reason: 'not_provided', pages: 0 },
    landedPrs: null,
    landings: [],
    hourlyUtc: [],
    hourlyLandedPrs: { p05: null, p50: null, p95: null },
    landingGapSeconds: { p50: null, p95: null },
    target: { landedPrsPerHour: 5, landingGapP95Seconds: 720 },
    verdict: 'insufficient_evidence',
    reason: 'not_provided',
  };
}

describe('pipeline scoreboard windows', () => {
  it('uses the previous UTC day for daily scoreboards', () => {
    expect(dailyWindow(new Date('2026-07-03T16:20:00Z'))).toEqual({
      since: '2026-07-02T00:00:00.000Z',
      until: '2026-07-03T00:00:00.000Z',
    });
  });

  it('uses a rolling 12h window for stall alarms', () => {
    expect(last12HoursWindow(new Date('2026-07-03T16:20:00Z'))).toEqual({
      since: '2026-07-03T04:20:00.000Z',
      until: '2026-07-03T16:20:00.000Z',
    });
  });

  it('uses exact half-open merge boundaries', () => {
    const window = {
      since: '2026-07-02T00:00:00.000Z',
      until: '2026-07-03T00:00:00.000Z',
    };
    const evidence = fetchMergedPrEvidence(
      window,
      () =>
        searchPage([
          mergedPr(3, window.until, '2026-07-01T01:00:00.000Z'),
          mergedPr(2, '2026-07-02T12:00:00.000Z', '2026-07-01T02:00:00.000Z'),
          mergedPr(1, window.since, '2026-07-01T03:00:00.000Z'),
        ]),
      { pageSize: 100 }
    );

    expect(evidence.complete).toBe(true);
    expect(evidence.prs.map(pr => pr.number)).toEqual([2, 1]);
  });

  it('paginates beyond the former 100-result cap', () => {
    const window = {
      since: '2026-07-02T00:00:00.000Z',
      until: '2026-07-03T00:00:00.000Z',
    };
    const rows = Array.from({ length: 101 }, (_, index) =>
      mergedPr(
        index + 1,
        '2026-07-02T12:00:00.000Z',
        new Date(Date.parse('2026-07-01T00:00:00.000Z') + index).toISOString()
      )
    );
    const evidence = fetchMergedPrEvidence(
      window,
      (cursor, pageSize) => {
        const offset = cursor === null ? 0 : Number(cursor);
        const nodes = rows.slice(offset, offset + pageSize);
        const nextOffset = offset + nodes.length;
        return searchPage(nodes, {
          totalCount: rows.length,
          hasNextPage: nextOffset < rows.length,
          endCursor: nextOffset < rows.length ? String(nextOffset) : null,
        });
      },
      { pageSize: 100 }
    );

    expect(evidence).toMatchObject({ complete: true, pages: 2 });
    expect(evidence.prs).toHaveLength(101);
  });

  it('derives exact subwindows from one complete snapshot', () => {
    const source = fetchMergedPrEvidence(
      {
        since: '2026-07-01T00:00:00.000Z',
        until: '2026-07-03T12:00:00.000Z',
      },
      () =>
        searchPage([
          mergedPr(3, '2026-07-03T06:00:00.000Z'),
          mergedPr(2, '2026-07-02T12:00:00.000Z'),
          mergedPr(1, '2026-07-01T12:00:00.000Z'),
        ])
    );
    const daily = filterMergedPrEvidence(source, {
      since: '2026-07-02T00:00:00.000Z',
      until: '2026-07-03T00:00:00.000Z',
    });

    expect(daily).toMatchObject({ complete: true, pages: 1 });
    expect(daily.prs.map(pr => pr.number)).toEqual([2]);
  });

  it('marks truncated label connections as incomplete', () => {
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      () =>
        searchPage([
          {
            ...mergedPr(1, '2026-07-02T12:00:00.000Z'),
            labels: { totalCount: 2, nodes: [{ name: 'taste' }] },
          },
        ])
    );

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'malformed_pr',
    });
  });

  it('fails closed when a derived window exceeds the source snapshot', () => {
    const source = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      () => searchPage([])
    );
    const evidence = filterMergedPrEvidence(source, {
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-03T00:00:00.000Z',
    });

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'window_not_covered',
    });
  });

  it.each([
    [
      'malformed page',
      () => ({ message: 'not a search page' }),
      'malformed_page',
    ],
    ['malformed row', () => searchPage([{ number: 1 }]), 'malformed_pr'],
    [
      'fetch failure',
      () => {
        throw new Error('network unavailable');
      },
      'fetch_failed',
    ],
    [
      'duplicate row',
      () =>
        searchPage([
          mergedPr(1, '2026-07-02T12:00:00.000Z', '2026-07-01T12:00:00.000Z'),
          mergedPr(1, '2026-07-02T11:00:00.000Z', '2026-07-01T13:00:00.000Z'),
        ]),
      'duplicate_pr',
    ],
    [
      'unstable ordering',
      () =>
        searchPage([
          mergedPr(1, '2026-07-02T11:00:00.000Z', '2026-07-02T12:00:00.000Z'),
          mergedPr(2, '2026-07-02T12:00:00.000Z', '2026-07-02T11:00:00.000Z'),
        ]),
      'unstable_page_order',
    ],
  ])('marks %s as incomplete evidence', (_name, fetchPage, reason) => {
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      fetchPage
    );

    expect(evidence).toMatchObject({ complete: false, reason });
  });

  it('marks a safety-page cutoff as incomplete instead of undercounting', () => {
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      cursor =>
        searchPage(
          [
            mergedPr(
              cursor === null ? 1 : 2,
              '2026-07-02T12:00:00.000Z',
              cursor === null
                ? '2026-07-01T01:00:00.000Z'
                : '2026-07-01T02:00:00.000Z'
            ),
          ],
          {
            totalCount: 3,
            hasNextPage: true,
            endCursor: cursor === null ? '1' : '2',
          }
        ),
      { pageSize: 1, maxPages: 2 }
    );

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'max_pages_reached',
      pages: 2,
    });
  });

  it('fails closed when merged membership changes between cursor pages', () => {
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      cursor =>
        cursor === null
          ? searchPage([mergedPr(1, '2026-07-02T12:00:00.000Z')], {
              totalCount: 2,
              hasNextPage: true,
              endCursor: 'next',
            })
          : searchPage([mergedPr(2, '2026-07-02T13:00:00.000Z')], {
              totalCount: 3,
            }),
      { pageSize: 1 }
    );

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'unstable_snapshot',
    });
    expect(evidence.prs.map(pr => pr.number)).toEqual([1]);
  });

  it('fails closed when metric-bearing labels change between scans', () => {
    let scan = 0;
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      () => {
        scan += 1;
        return searchPage([
          mergedPr(
            1,
            '2026-07-02T12:00:00.000Z',
            '2026-07-01T12:00:00.000Z',
            scan === 1 ? [] : ['taste']
          ),
        ]);
      }
    );

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'unstable_snapshot',
    });
  });

  it('fails closed when a metric-bearing ref changes between scans', () => {
    const mutations = [
      scan => ({
        headRefName: scan === 1 ? 'symphony/JOV-1-fix' : 'symphony/JOV-2-fix',
      }),
      scan => ({ baseRefName: scan === 1 ? 'main' : 'codex/stack-parent' }),
    ];
    for (const mutation of mutations) {
      let scan = 0;
      const evidence = fetchMergedPrEvidence(
        {
          since: '2026-07-02T00:00:00.000Z',
          until: '2026-07-03T00:00:00.000Z',
        },
        () => {
          scan += 1;
          return searchPage([
            {
              ...mergedPr(1, '2026-07-02T12:00:00.000Z'),
              ...mutation(scan),
            },
          ]);
        }
      );
      expect(evidence).toMatchObject({
        complete: false,
        reason: 'unstable_snapshot',
      });
    }
  });

  it('ignores metric-irrelevant title edits between scans', () => {
    let scan = 0;
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      () => {
        scan += 1;
        return searchPage([
          {
            ...mergedPr(1, '2026-07-02T12:00:00.000Z'),
            title: `Title revision ${scan}`,
          },
        ]);
      }
    );

    expect(evidence).toMatchObject({ complete: true, reason: null });
  });

  it('marks missing next-page cursors as incomplete', () => {
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      () =>
        searchPage([mergedPr(1, '2026-07-02T12:00:00.000Z')], {
          totalCount: 2,
          hasNextPage: true,
          endCursor: null,
        })
    );

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'malformed_cursor',
    });
  });

  it('marks terminal count mismatches as incomplete', () => {
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      () =>
        searchPage([mergedPr(1, '2026-07-02T12:00:00.000Z')], {
          totalCount: 2,
        })
    );

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'result_count_mismatch',
    });
  });

  it('marks invalid pagination configuration as incomplete', () => {
    const evidence = fetchMergedPrEvidence(
      {
        since: '2026-07-02T00:00:00.000Z',
        until: '2026-07-03T00:00:00.000Z',
      },
      () => searchPage([]),
      { pageSize: 101 }
    );

    expect(evidence).toMatchObject({
      complete: false,
      reason: 'invalid_fetch_options',
      pages: 0,
    });
  });
});

describe('Symphony landed throughput', () => {
  const window = {
    since: '2026-07-01T00:00:00.000Z',
    until: '2026-07-02T00:00:00.000Z',
  };

  function evenlySpacedSymphonyPrs(excludedHours = new Set()) {
    return Array.from({ length: 24 * 5 }, (_, index) => {
      const hour = Math.floor(index / 5);
      if (excludedHours.has(hour)) return null;
      const mergedAt = new Date(
        Date.parse(window.since) + index * 12 * 60_000 + 6 * 60_000
      ).toISOString();
      return normalizedMergedPr(
        index + 1,
        mergedAt,
        window.since,
        [],
        `symphony/JOV-${index + 1}-fix`
      );
    }).filter(Boolean);
  }

  it('keeps idle UTC hours in the percentile distribution', () => {
    const receipt = buildSymphonyThroughputReceipt({
      complete: true,
      reason: null,
      pages: 1,
      window,
      prs: [
        normalizedMergedPr(
          1,
          '2026-07-01T00:10:00.000Z',
          '2026-07-01T00:00:00.000Z',
          [],
          'symphony/JOV-1-fix'
        ),
        normalizedMergedPr(
          2,
          '2026-07-01T00:20:00.000Z',
          '2026-07-01T00:00:00.000Z',
          [],
          'not-symphony/JOV-2-fix'
        ),
        normalizedMergedPr(
          3,
          '2026-07-01T00:30:00.000Z',
          '2026-07-01T00:00:00.000Z',
          [],
          'symphony/JOV-3-fix',
          'codex/stack-parent'
        ),
      ],
    });

    expect(receipt.landings).toEqual([
      { number: 1, mergedAt: '2026-07-01T00:10:00.000Z' },
    ]);
    expect(receipt.hourlyUtc).toHaveLength(24);
    expect(receipt.hourlyUtc.slice(1).every(hour => hour.landedPrs === 0)).toBe(
      true
    );
    expect(receipt.hourlyLandedPrs).toEqual({ p05: 0, p50: 0, p95: 0 });
  });

  it('passes only when the reliable hourly floor and gap p95 both meet target', () => {
    const prs = evenlySpacedSymphonyPrs();
    const receipt = buildSymphonyThroughputReceipt({
      complete: true,
      reason: null,
      pages: 2,
      window,
      prs,
    });

    expect(receipt.hourlyLandedPrs).toEqual({ p05: 5, p50: 5, p95: 5 });
    expect(receipt.landingGapSeconds.p95).toBe(720);
    expect(receipt.verdict).toBe('passing');
  });

  it('requires both the hourly floor and gap p95 to pass', () => {
    const clusteredPrs = Array.from({ length: 24 * 5 }, (_, index) => {
      const hour = Math.floor(index / 5);
      const minute = index % 5;
      return normalizedMergedPr(
        index + 1,
        new Date(
          Date.parse(window.since) + hour * 3_600_000 + minute * 60_000
        ).toISOString(),
        window.since,
        [],
        `symphony/JOV-${index + 1}-fix`
      );
    });
    const hourlyOnly = buildSymphonyThroughputReceipt({
      complete: true,
      reason: null,
      pages: 1,
      window,
      prs: clusteredPrs,
    });
    const gapOnly = buildSymphonyThroughputReceipt({
      complete: true,
      reason: null,
      pages: 1,
      window,
      prs: evenlySpacedSymphonyPrs(new Set([5, 10])),
    });

    expect(hourlyOnly.hourlyLandedPrs.p05).toBe(5);
    expect(hourlyOnly.landingGapSeconds.p95).toBeGreaterThan(720);
    expect(hourlyOnly.verdict).toBe('failing');
    expect(gapOnly.hourlyLandedPrs.p05).toBe(0);
    expect(gapOnly.landingGapSeconds.p95).toBe(720);
    expect(gapOnly.verdict).toBe('failing');
  });

  it('suppresses all metrics when merge evidence is incomplete', () => {
    const receipt = buildSymphonyThroughputReceipt({
      complete: false,
      reason: 'max_pages_reached',
      pages: 100,
      window,
      prs: [],
    });

    expect(receipt).toMatchObject({
      landedPrs: null,
      hourlyUtc: [],
      verdict: 'insufficient_evidence',
      reason: 'merge_evidence_max_pages_reached',
    });
  });

  it.each([
    { complete: true, reason: null, pages: 0 },
    { complete: true, reason: 'fetch_failed', pages: 1 },
    { complete: false, reason: null, pages: 0 },
  ])('rejects impossible evidence status %#', status => {
    const receipt = buildSymphonyThroughputReceipt({
      ...status,
      window,
      prs: [],
    });
    expect(receipt).toMatchObject({
      verdict: 'insufficient_evidence',
      reason: 'invalid_evidence_status',
    });
  });

  it.each([
    [
      'invalid timestamp',
      { since: 'invalid', until: window.until },
      'invalid_window',
    ],
    [
      'equal bounds',
      { since: window.since, until: window.since },
      'invalid_window',
    ],
    [
      'reversed bounds',
      { since: window.until, until: window.since },
      'invalid_window',
    ],
    [
      '23-hour sample',
      {
        since: window.since,
        until: '2026-07-01T23:00:00.000Z',
      },
      'window_too_short',
    ],
    [
      'overlong sample',
      {
        since: window.since,
        until: '2026-08-02T00:00:00.000Z',
      },
      'window_too_long',
    ],
    [
      'unaligned sample',
      {
        since: '2026-07-01T00:30:00.000Z',
        until: '2026-07-02T00:30:00.000Z',
      },
      'window_not_hour_aligned',
    ],
  ])('fails closed for %s', (_name, candidateWindow, reason) => {
    const receipt = buildSymphonyThroughputReceipt({
      complete: true,
      reason: null,
      pages: 1,
      window: candidateWindow,
      prs: [],
    });

    expect(receipt).toMatchObject({
      landedPrs: null,
      verdict: 'insufficient_evidence',
      reason,
    });
  });

  it('ignores canonical Symphony branches outside the half-open window', () => {
    const receipt = buildSymphonyThroughputReceipt({
      complete: true,
      reason: null,
      pages: 1,
      window,
      prs: [
        normalizedMergedPr(
          1,
          '2026-06-30T23:59:59.000Z',
          window.since,
          [],
          'symphony/JOV-1-fix'
        ),
        normalizedMergedPr(
          2,
          '2026-07-01T12:00:00.000Z',
          window.since,
          [],
          'symphony/JOV-2-fix'
        ),
        normalizedMergedPr(
          3,
          window.until,
          window.since,
          [],
          'symphony/JOV-3-fix'
        ),
      ],
    });

    expect(receipt.landedPrs).toBe(1);
  });

  it('sorts merge timestamps before computing landing gaps', () => {
    const receipt = buildSymphonyThroughputReceipt({
      complete: true,
      reason: null,
      pages: 1,
      window,
      prs: [3, 1, 2].map(hour =>
        normalizedMergedPr(
          hour,
          new Date(Date.parse(window.since) + hour * 3_600_000).toISOString(),
          window.since,
          [],
          `symphony/JOV-${hour}-fix`
        )
      ),
    });

    expect(receipt.landingGapSeconds).toEqual({ p50: 3600, p95: 75_600 });
  });
});

describe('pipeline scoreboard compute', () => {
  const window = {
    since: '2026-07-02T00:00:00.000Z',
    until: '2026-07-03T00:00:00.000Z',
  };

  it('returns zeroed metrics for the empty path', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: [],
      jobLogEntries: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
    });

    expect(scoreboard.funnel).toMatchObject({
      ready: 0,
      claimed: 0,
      inProgress: 0,
      blocked: 0,
    });
    expect(scoreboard.shipper.claims).toBe(0);
    expect(scoreboard.shipper.ships).toBe(0);
    expect(scoreboard.alarms).toEqual([]);
  });

  it('computes funnel deltas against the previous local snapshot', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: [
        issue(1, ['codex']),
        issue(2, ['codex', 'codex-in-progress']),
        issue(3, ['codex', 'codex-blocked']),
        issue(4, ['codex', 'codex-blocked']),
        issue(5, ['codex', 'human-review-required']),
        issue(6, ['codex', 'no-auto']),
        issue(7, ['codex', 'type:epic']),
      ],
      previous: {
        schemaVersion: 3,
        ts: '2026-07-02T00:00:00.000Z',
        window,
        funnel: {
          ready: 3,
          claimed: 0,
          inProgress: 0,
          blocked: 1,
          deltas: { ready: 0, claimed: 0, inProgress: 0, blocked: 0 },
        },
        shipper: {
          claims: 0,
          ships: 0,
          failuresByCategory: {},
          retriesUsed: 0,
          costPerShippedIssueUsd: null,
        },
        queue: {
          merges: 0,
          mqAttemptsPerMerge: null,
          evidence: { complete: true, reason: null, pages: 1 },
          timeToMergeSeconds: { p50: 0, p95: 0 },
        },
        symphony: insufficientSymphony(window),
        gates: {
          tasteLabeledPrsWeek: 0,
          tasteEvidence: { complete: true, reason: null, pages: 1 },
          autofixInterventions: 0,
        },
        alarms: [],
      },
      mergedPrs: [],
      mergeEvidence: completeEvidence,
    });

    expect(scoreboard.funnel.ready).toBe(1);
    expect(scoreboard.funnel.claimed).toBe(1);
    expect(scoreboard.funnel.blocked).toBe(2);
    expect(scoreboard.funnel.deltas).toEqual({
      ready: -2,
      claimed: 1,
      inProgress: 1,
      blocked: 1,
    });
  });

  it('fires the blocked-delta alarm when blocked grows by more than 15/day', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: Array.from({ length: 17 }, (_, index) =>
        issue(index + 1, ['codex', 'codex-blocked'])
      ),
      previous: {
        schemaVersion: 3,
        ts: '2026-07-02T00:00:00.000Z',
        window,
        funnel: {
          ready: 0,
          claimed: 0,
          inProgress: 0,
          blocked: 1,
          deltas: { ready: 0, claimed: 0, inProgress: 0, blocked: 0 },
        },
        shipper: {
          claims: 0,
          ships: 0,
          failuresByCategory: {},
          retriesUsed: 0,
          costPerShippedIssueUsd: null,
        },
        queue: {
          merges: 0,
          mqAttemptsPerMerge: null,
          evidence: { complete: true, reason: null, pages: 1 },
          timeToMergeSeconds: { p50: 0, p95: 0 },
        },
        symphony: insufficientSymphony(window),
        gates: {
          tasteLabeledPrsWeek: 0,
          tasteEvidence: { complete: true, reason: null, pages: 1 },
          autofixInterventions: 0,
        },
        alarms: [],
      },
      mergedPrs: [],
      mergeEvidence: completeEvidence,
    });

    expect(scoreboard.alarms.map(alarm => alarm.rule)).toContain(
      'blocked_delta'
    );
  });

  it('does not report backlog growth without a comparable prior snapshot', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: Array.from({ length: 17 }, (_, index) =>
        issue(index + 1, ['codex', 'codex-blocked'])
      ),
      mergedPrs: [],
      mergeEvidence: completeEvidence,
    });

    expect(scoreboard.funnel.deltas.blocked).toBe(0);
    expect(scoreboard.alarms.map(alarm => alarm.rule)).not.toContain(
      'blocked_delta'
    );
  });

  it('fires the simulated stall alarm when claims have no ships', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T12:00:00.000Z',
      window: {
        since: '2026-07-03T00:00:00.000Z',
        until: '2026-07-03T12:00:00.000Z',
      },
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
      jobLogEntries: [
        {
          job: 'codex-issue-shipper',
          event: 'agent_failed',
          ts: '2026-07-03T06:00:00.000Z',
          error: 'agent exited without PR',
        },
      ],
    });

    expect(scoreboard.shipper.claims).toBe(1);
    expect(scoreboard.shipper.ships).toBe(0);
    expect(scoreboard.alarms).toEqual([
      expect.objectContaining({ rule: 'zero_ships_after_claims' }),
    ]);
  });

  it('counts pre-agent claim failures as claims and failure categories', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T12:00:00.000Z',
      window,
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
      jobLogEntries: [
        {
          job: 'codex-issue-shipper',
          event: 'gbrain_failed',
          ts: '2026-07-02T06:00:00.000Z',
          issue: 123,
          error: 'gbrain capture failed: Page not found',
        },
      ],
    });

    expect(scoreboard.shipper.claims).toBe(1);
    expect(scoreboard.shipper.failuresByCategory).toEqual({
      gbrain_capture_failed_page_not_found: 1,
    });
    expect(scoreboard.alarms.map(alarm => alarm.rule)).toContain(
      'zero_ships_after_claims'
    );
  });

  it('deduplicates deterministic finisher ship events by issue', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T12:00:00.000Z',
      window,
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
      jobLogEntries: [
        {
          job: 'codex-issue-shipper',
          event: 'deterministic_finish_shipped',
          ts: '2026-07-02T06:00:00.000Z',
          issue: 123,
        },
        {
          job: 'codex-issue-shipper',
          event: 'pr_found_after_success',
          ts: '2026-07-02T06:01:00.000Z',
          issue: 123,
        },
      ],
    });

    expect(scoreboard.shipper.ships).toBe(1);
  });

  it('uses only shipper costs for cost per shipped issue', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T12:00:00.000Z',
      window,
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
      jobLogEntries: [
        {
          job: 'codex-issue-shipper',
          event: 'pr_found_after_success',
          ts: '2026-07-02T06:00:00.000Z',
          issue: 123,
          cost: 2,
        },
        {
          job: 'daily-briefing',
          event: 'sent',
          ts: '2026-07-02T06:00:00.000Z',
          cost: 98,
        },
      ],
    });

    expect(scoreboard.shipper.costPerShippedIssueUsd).toBe(2);
  });

  it('renders alarm messages with the evaluated window', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T12:00:00.000Z',
      window,
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
      jobLogEntries: [
        {
          job: 'codex-issue-shipper',
          event: 'gbrain_failed',
          ts: '2026-07-02T06:00:00.000Z',
          issue: 123,
        },
      ],
    });

    expect(scoreboard.alarms[0].message).toContain(window.since);
    expect(scoreboard.alarms[0].message).toContain(window.until);
  });

  it('does not fire the stall alarm without claims or when a ship exists', () => {
    expect(
      evaluatePipelineAlarms(
        buildPipelineScoreboard({
          ts: '2026-07-03T12:00:00.000Z',
          window,
          issues: [],
          mergedPrs: [],
          mergeEvidence: completeEvidence,
          jobLogEntries: [],
        })
      )
    ).toEqual([]);

    expect(
      buildPipelineScoreboard({
        ts: '2026-07-03T12:00:00.000Z',
        window,
        issues: [],
        mergedPrs: [],
        mergeEvidence: completeEvidence,
        jobLogEntries: [
          {
            job: 'codex-issue-shipper',
            event: 'agent_succeeded',
            ts: '2026-07-02T06:00:00.000Z',
          },
          {
            job: 'codex-issue-shipper',
            event: 'pr_found_after_success',
            ts: '2026-07-02T06:10:00.000Z',
          },
        ],
      }).alarms
    ).toEqual([]);
  });

  it('renders the digest scoreboard section', () => {
    const body = renderPipelineScoreboard(
      buildPipelineScoreboard({
        ts: '2026-07-03T00:00:00.000Z',
        window,
        issues: [issue(1, ['codex'])],
        jobLogEntries: [],
        ciMetrics: {
          latency: { readyToMergeSeconds: { p50: 600, p95: 900 } },
        },
        mergedPrs: [{ labels: [{ name: 'merge-queue' }] }],
        mergeEvidence: completeEvidence,
      })
    );

    expect(body).toContain('Pipeline scoreboard');
    expect(body).toContain('Funnel: ready 1');
    expect(body).toContain('Queue: merges 1');
    expect(body).toContain('time-to-merge p50 10m / p95 15m');
    expect(body).toContain('Symphony: insufficient evidence (not_provided)');
  });

  it('renders and alarms on complete Symphony evidence below target', () => {
    const symphonyWindow = {
      since: '2026-06-26T00:00:00.000Z',
      until: '2026-07-03T00:00:00.000Z',
    };
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
      symphonyMergeEvidence: {
        complete: true,
        reason: null,
        pages: 1,
        window: symphonyWindow,
        prs: [
          normalizedMergedPr(
            1,
            '2026-07-01T00:10:00.000Z',
            '2026-07-01T00:00:00.000Z',
            [],
            'symphony/JOV-1-fix'
          ),
        ],
      },
    });
    const body = renderPipelineScoreboard(scoreboard);

    expect(scoreboard.alarms.map(alarm => alarm.rule)).toContain(
      'symphony_throughput_below_target'
    );
    expect(body).toContain('Symphony: 1 landed');
    expect(body).toContain('target 5/hour failing');
  });

  it('does not raise the throughput alarm for a fully passing receipt', () => {
    const passingWindow = {
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z',
    };
    const prs = Array.from({ length: 24 * 5 }, (_, index) =>
      normalizedMergedPr(
        index + 1,
        new Date(
          Date.parse(passingWindow.since) + index * 12 * 60_000 + 6 * 60_000
        ).toISOString(),
        passingWindow.since,
        [],
        `symphony/JOV-${index + 1}-fix`
      )
    );
    const scoreboard = buildPipelineScoreboard({
      ts: passingWindow.until,
      window,
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
      symphonyMergeEvidence: {
        complete: true,
        reason: null,
        pages: 2,
        window: passingWindow,
        prs,
      },
    });

    expect(scoreboard.symphony.verdict).toBe('passing');
    expect(scoreboard.alarms.map(alarm => alarm.rule)).not.toContain(
      'symphony_throughput_below_target'
    );
  });

  it('suppresses queue conclusions when merge evidence is incomplete', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: [],
      mergedPrs: [{ labels: [{ name: 'merge-queue' }] }],
      mergeEvidence: {
        complete: false,
        reason: 'max_pages_reached',
        pages: 100,
      },
    });
    const body = renderPipelineScoreboard(scoreboard);

    expect(scoreboard.queue.merges).toBeNull();
    expect(scoreboard.queue.mqAttemptsPerMerge).toBeNull();
    expect(scoreboard.queue.evidence).not.toHaveProperty('prs');
    expect(scoreboard.alarms.map(alarm => alarm.rule)).toContain(
      'merge_evidence_incomplete'
    );
    expect(body).toContain('merge evidence incomplete');
    expect(body).toContain('merge count and MQ attempts/merge suppressed');
    expect(body).not.toContain('Queue: merges 1');
  });
});

describe('pipeline scoreboard digest and schedule wiring', () => {
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..');

  it('includes scoreboard text in the daily briefing context', () => {
    const context = buildDailyBriefingContext({
      mergedPrs: [{ number: 1, title: 'Ship scoreboard' }],
      voiceMemos: 0,
      dispatches: 2,
      paidSpend: 0,
      pipelineScoreboard: 'Pipeline scoreboard\nFunnel: ready 1',
    });

    expect(context).toContain('Pipeline scoreboard');
    expect(context).toContain('Funnel: ready 1');
    expect(context).toContain('#1 Ship scoreboard');
  });

  it('rejects malformed persisted Symphony receipts', () => {
    const window = {
      since: '2026-07-02T00:00:00.000Z',
      until: '2026-07-03T00:00:00.000Z',
    };
    const scoreboard = buildPipelineScoreboard({
      ts: window.until,
      window,
      issues: [],
      mergedPrs: [],
      mergeEvidence: completeEvidence,
    });
    const directory = mkdtempSync(join(tmpdir(), 'pipeline-scoreboard-'));
    const path = join(directory, 'latest.json');
    try {
      writeFileSync(path, JSON.stringify(scoreboard));
      expect(readLatestScoreboard(path)).toMatchObject({ schemaVersion: 3 });

      const malformed = JSON.parse(JSON.stringify(scoreboard));
      delete malformed.symphony.target;
      writeFileSync(path, JSON.stringify(malformed));
      expect(readLatestScoreboard(path)).toBeNull();

      const contradictory = JSON.parse(JSON.stringify(scoreboard));
      contradictory.symphony.verdict = 'passing';
      contradictory.symphony.reason = null;
      writeFileSync(path, JSON.stringify(contradictory));
      expect(readLatestScoreboard(path)).toBeNull();

      const alteredTarget = JSON.parse(JSON.stringify(scoreboard));
      alteredTarget.symphony.target.landedPrsPerHour = 1;
      writeFileSync(path, JSON.stringify(alteredTarget));
      expect(readLatestScoreboard(path)).toBeNull();

      const completeScoreboard = buildPipelineScoreboard({
        ts: window.until,
        window,
        issues: [],
        mergedPrs: [],
        mergeEvidence: completeEvidence,
        symphonyMergeEvidence: {
          complete: true,
          reason: null,
          pages: 1,
          window,
          prs: [
            normalizedMergedPr(
              1,
              '2026-07-02T00:10:00.000Z',
              window.since,
              [],
              'symphony/JOV-1-fix'
            ),
          ],
        },
      });
      writeFileSync(path, JSON.stringify(completeScoreboard));
      expect(readLatestScoreboard(path)).toMatchObject({ schemaVersion: 3 });

      /** @type {Array<(receipt: any) => void>} */
      const semanticMutations = [
        receipt => receipt.hourlyUtc.pop(),
        receipt => {
          receipt.hourlyUtc[0].landedPrs = 2;
        },
        receipt => {
          receipt.hourlyLandedPrs.p95 = 999;
        },
        receipt => {
          receipt.landingGapSeconds.p95 = 1;
        },
      ];
      for (const mutate of semanticMutations) {
        const inconsistent = JSON.parse(JSON.stringify(completeScoreboard));
        mutate(inconsistent.symphony);
        writeFileSync(path, JSON.stringify(inconsistent));
        expect(readLatestScoreboard(path)).toBeNull();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps package script, launchd unit, and cron registry wired together', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
    );
    const plist = readFileSync(
      resolve(
        repoRoot,
        'scripts/hermes/launchd/co.jovie.hermes.cron-pipeline-scoreboard.plist.template'
      ),
      'utf8'
    );
    const cronRegistry = readFileSync(
      resolve(repoRoot, 'docs/CRON_REGISTRY.md'),
      'utf8'
    );
    const job = readFileSync(
      resolve(repoRoot, 'scripts/hermes/jobs/pipeline-scoreboard.ts'),
      'utf8'
    );

    expect(packageJson.scripts['hermes:pipeline-scoreboard']).toBe(
      'tsx scripts/hermes/jobs/pipeline-scoreboard.ts'
    );
    expect(plist).toContain(
      '<string>co.jovie.hermes.cron-pipeline-scoreboard</string>'
    );
    expect(plist).toContain(
      '<string>{{JOVIE_REPO}}/scripts/hermes/jobs/pipeline-scoreboard.ts</string>'
    );
    expect(plist).toContain('<key>StartInterval</key>');
    expect(plist).toContain('<integer>3600</integer>');
    expect(cronRegistry).toContain('co.jovie.hermes.cron-pipeline-scoreboard');
    expect(cronRegistry).toContain(
      'scripts/hermes/jobs/pipeline-scoreboard.ts'
    );
    expect(job).toContain(
      'nodes{number title headRefName baseRefName createdAt'
    );
    expect(job).toContain('symphonyMergeEvidence: mergedWeekly');
    expect(job).toContain('symphonyThroughputVerdict');
  });
});
