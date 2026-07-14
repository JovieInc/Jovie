import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildDailyBriefingContext } from '../../hermes/jobs/daily-briefing.ts';
import {
  buildPipelineScoreboard,
  dailyWindow,
  evaluatePipelineAlarms,
  last12HoursWindow,
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
        schemaVersion: 1,
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
          timeToMergeSeconds: { p50: 0, p95: 0 },
        },
        gates: { tasteLabeledPrsWeek: 0, autofixInterventions: 0 },
        alarms: [],
      },
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
        schemaVersion: 1,
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
          timeToMergeSeconds: { p50: 0, p95: 0 },
        },
        gates: { tasteLabeledPrsWeek: 0, autofixInterventions: 0 },
        alarms: [],
      },
    });

    expect(scoreboard.alarms.map(alarm => alarm.rule)).toContain(
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
          jobLogEntries: [],
        })
      )
    ).toEqual([]);

    expect(
      buildPipelineScoreboard({
        ts: '2026-07-03T12:00:00.000Z',
        window,
        issues: [],
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
      })
    );

    expect(body).toContain('Pipeline scoreboard');
    expect(body).toContain('Funnel: ready 1');
    expect(body).toContain('Queue: merges 1');
    expect(body).toContain('time-to-merge p50 10m / p95 15m');
  });

  it('prefers schema-v2 fleet lead time over the schema-v1 fallback', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: [],
      ciMetrics: {
        hydration: { complete: true },
        sampleSizes: { fleetLeadTime: 2 },
        latency: {
          fleetLeadTimeSeconds: { p50: 120, p95: 240 },
          readyToMergeSeconds: { p50: 600, p95: 900 },
        },
      },
    });

    expect(scoreboard.queue.timeToMergeSeconds).toEqual({ p50: 120, p95: 240 });
    expect(scoreboard.queue.timeToMergeAvailable).toBe(true);
  });

  it('marks schema-v2 fleet lead time unavailable when no samples exist', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: [],
      ciMetrics: {
        hydration: { complete: true },
        sampleSizes: { fleetLeadTime: 0 },
        latency: { fleetLeadTimeSeconds: { p50: 120, p95: 240 } },
      },
    });

    expect(scoreboard.queue.timeToMergeSeconds).toEqual({ p50: 0, p95: 0 });
    expect(scoreboard.queue.timeToMergeAvailable).toBe(false);
    expect(scoreboard.queue.timeToMergeUnavailableReason).toBe('no_samples');
    expect(renderPipelineScoreboard(scoreboard)).toContain(
      'time-to-merge n/a (no samples)'
    );
  });

  it('suppresses queue latency from a partially hydrated snapshot', () => {
    const scoreboard = buildPipelineScoreboard({
      ts: '2026-07-03T00:00:00.000Z',
      window,
      issues: [],
      ciMetrics: {
        hydration: { complete: false },
        latency: { fleetLeadTimeSeconds: { p50: 120, p95: 240 } },
      },
    });

    expect(scoreboard.queue.timeToMergeSeconds).toEqual({ p50: 0, p95: 0 });
    expect(scoreboard.queue.timeToMergeAvailable).toBe(false);
    expect(scoreboard.queue.timeToMergeUnavailableReason).toBe(
      'partial_hydration'
    );
    expect(renderPipelineScoreboard(scoreboard)).toContain(
      'time-to-merge n/a (partial hydration)'
    );
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
  });
});
