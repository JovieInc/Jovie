import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runLiveness } from '../../automation-liveness.mjs';
import {
  ENFORCE_FROM,
  evaluateRedMonitors,
  isGatedMonitor,
  LEASE_MAX_MS,
  leaseIsLive,
  MONITOR_INCIDENTS_PATH,
  needsOwner,
  parseMonitorIncidents,
  redMonitorAnnotations,
  redMonitorSummary,
  summarizeRunStreak,
} from '../red-monitor-owner-gate.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// Fixed clock: report-only (before ENFORCE_FROM) unless a test says otherwise.
const NOW = Date.parse('2026-11-11T16:00:00Z');
const ENFORCED_NOW = Date.parse(ENFORCE_FROM);
const HOUR = 3600 * 1000;
const at = hoursAgo => new Date(NOW - hoursAgo * HOUR).toISOString();
const run = (id, conclusion, hoursAgo) => ({
  id,
  conclusion,
  created_at: at(hoursAgo),
  updated_at: at(hoursAgo),
});

function entry(id, workflow, triggerKind = 'github-cron') {
  return {
    id,
    status: 'live',
    trigger: { kind: triggerKind },
    receipt: {
      kind: 'github-workflow',
      repo: 'JovieInc/Jovie',
      workflow,
      branch: 'main',
      conclusions: ['success', 'failure'],
    },
    maxStalenessMinutes: 2880,
  };
}

const observed = runsById =>
  new Map(
    Object.entries(runsById).map(([id, runs]) => [
      id,
      { streak: summarizeRunStreak(runs) },
    ])
  );

const lease = (workflow, overrides = {}) => ({
  repo: null,
  workflow,
  incident: 'JOV-1',
  owner: 'gem',
  openedAt: at(2),
  until: at(-24),
  reason: 'fixing',
  ...overrides,
});

describe('summarizeRunStreak', () => {
  it('counts failures since the newest green, ignoring skipped, cancelled and duplicate runs', () => {
    const streak = summarizeRunStreak([
      run(3, 'failure', 1),
      run(5, 'cancelled', 0.5),
      run(2, 'success', 5),
      run(4, 'failure', 0.8),
      run(3, 'failure', 1),
      run(1, 'failure', 9),
    ]);
    expect(streak).toMatchObject({
      consecutiveFailures: 2,
      countIsLowerBound: false,
      lastGreenAt: at(5),
      greenBefore: null,
      redSince: at(1),
      failingRunIds: [4, 3],
    });
  });

  it('marks the count as a lower bound and bounds the last green when no green is in view', () => {
    const streak = summarizeRunStreak([
      run(1, 'failure', 30),
      run(2, 'failure', 2),
    ]);
    expect(streak.consecutiveFailures).toBe(2);
    expect(streak.countIsLowerBound).toBe(true);
    expect(streak.lastGreenAt).toBeNull();
    expect(streak.greenBefore).toBe(at(30));
    expect(streak.redSince).toBe(at(30));
  });

  it('is empty for no runs', () => {
    expect(summarizeRunStreak([])).toMatchObject({
      consecutiveFailures: 0,
      conclusiveRuns: 0,
    });
  });
});

describe('needsOwner', () => {
  const streak = (
    failures,
    lastGreenHours,
    greenBeforeHours = null,
    redSinceHours = undefined
  ) => ({
    consecutiveFailures: failures,
    lastGreenAt: lastGreenHours === null ? null : at(lastGreenHours),
    greenBefore: greenBeforeHours === null ? null : at(greenBeforeHours),
    ...(redSinceHours === undefined ? {} : { redSince: at(redSinceHours) }),
  });

  it('never flags a monitor whose newest verdict is green, however old', () => {
    expect(needsOwner(streak(0, 24 * 30), NOW)).toBe(false);
  });

  it('allows up to 3 failures inside 24 hours of the last green', () => {
    expect(needsOwner(streak(3, 23), NOW)).toBe(false);
  });

  it('flags more than 3 consecutive failures', () => {
    expect(needsOwner(streak(4, 1), NOW)).toBe(true);
  });

  it('flags a red streak whose first failure is more than 24 hours old', () => {
    expect(needsOwner(streak(2, 50, null, 25), NOW)).toBe(true);
    // An observation without redSince falls back to the last green.
    expect(needsOwner(streak(1, 25), NOW)).toBe(true);
  });

  it("does not flag a weekly or daily monitor's first failure (Seer review on #25013)", () => {
    // Weekly: last green 7 days ago, first failure an hour ago.
    const weekly = summarizeRunStreak([
      run(2, 'failure', 1),
      run(1, 'success', 24 * 7),
    ]);
    expect(needsOwner(weekly, NOW)).toBe(false);
    // Daily with jitter: last green 24.5 hours ago, first failure just now.
    const daily = summarizeRunStreak([
      run(2, 'failure', 0.2),
      run(1, 'success', 24.5),
    ]);
    expect(needsOwner(daily, NOW)).toBe(false);
    // Still red a day later: now it needs an owner.
    const stillRed = summarizeRunStreak([
      run(3, 'failure', 0.2),
      run(2, 'failure', 24.2),
      run(1, 'success', 48.5),
    ]);
    expect(needsOwner(stillRed, NOW)).toBe(true);
  });

  it('uses the oldest verdict in view as the bound when no green is visible', () => {
    expect(needsOwner(streak(2, null, 30), NOW)).toBe(true);
    expect(needsOwner(streak(2, null, 3), NOW)).toBe(false);
  });
});

describe('owner leases', () => {
  it('is live before until and never past 7 days from opening', () => {
    expect(leaseIsLive(lease('a.yml'), NOW)).toBe(true);
    expect(leaseIsLive(lease('a.yml', { until: at(1) }), NOW)).toBe(false);
    const longLease = lease('a.yml', { openedAt: at(24 * 8), until: at(-24) });
    expect(LEASE_MAX_MS).toBe(7 * 24 * HOUR);
    expect(leaseIsLive(longLease, NOW)).toBe(false);
    expect(leaseIsLive(lease('a.yml', { owner: '' }), NOW)).toBe(false);
  });

  it('parses the incidents file, skipping the header and naming bad rows', () => {
    const text = [
      JSON.stringify({ schema: 'jovie-monitor-incident/v1' }),
      JSON.stringify(lease('a.yml')),
      '{not json',
      JSON.stringify({ workflow: 'b.yml', incident: 'JOV-2', owner: 'gem' }),
      JSON.stringify({ ...lease('c.yml'), until: 'tomorrow' }),
      '',
    ].join('\n');
    const { leases, errors } = parseMonitorIncidents(text);
    expect(leases.map(row => row.workflow)).toEqual(['a.yml']);
    expect(errors).toEqual([
      'line 3: not JSON',
      'line 4: missing or invalid openedAt, until',
      'line 5: missing or invalid until',
    ]);
  });

  it('the checked-in incidents file parses cleanly', () => {
    const text = readFileSync(
      resolve(repoRoot, MONITOR_INCIDENTS_PATH),
      'utf8'
    );
    expect(parseMonitorIncidents(text).errors).toEqual([]);
  });
});

describe('evaluateRedMonitors', () => {
  const registry = {
    entries: [
      entry(
        'github:jovie:claim-checkout-dogfood',
        'claim-checkout-dogfood.yml',
        'github-event'
      ),
      entry('github:jovie:cost-anomaly-gate', 'cost-anomaly-gate.yml'),
      entry('lanes-clock:cost-anomaly', 'cost-anomaly-gate.yml', 'lanes-clock'),
      entry('github:jovie:nightly', 'nightly.yml'),
      entry('derived:jovie:not-scheduled', 'derived.yml', 'derived'),
    ],
  };
  const red = [
    run(4, 'failure', 1),
    run(3, 'failure', 2),
    run(2, 'failure', 3),
    run(1, 'failure', 4),
    run(0, 'success', 5),
  ];
  const observations = observed({
    'github:jovie:claim-checkout-dogfood': red,
    'github:jovie:cost-anomaly-gate': red,
    'lanes-clock:cost-anomaly': red,
    'github:jovie:nightly': [run(9, 'success', 1)],
    'derived:jovie:not-scheduled': red,
  });

  it('gates only live scheduled or post-deploy github workflows', () => {
    expect(registry.entries.filter(isGatedMonitor).map(row => row.id)).toEqual([
      'github:jovie:claim-checkout-dogfood',
      'github:jovie:cost-anomaly-gate',
      'lanes-clock:cost-anomaly',
      'github:jovie:nightly',
    ]);
  });

  it('report-only before the enforcement date: lists offenders once per workflow and warns', () => {
    const result = evaluateRedMonitors({ registry, observations, nowMs: NOW });
    expect(result.mode).toBe('report-only');
    expect(result.status).toBe('warn');
    expect(
      result.offenders.map(row => [
        row.workflow,
        row.reason,
        row.consecutiveFailures,
      ])
    ).toEqual([
      ['claim-checkout-dogfood.yml', 'no-incident', 4],
      ['cost-anomaly-gate.yml', 'no-incident', 4],
    ]);
    expect(result.offenders[1].automationIds).toEqual([
      'github:jovie:cost-anomaly-gate',
      'lanes-clock:cost-anomaly',
    ]);
    expect(redMonitorAnnotations(result)).toContain(
      '::warning::red monitor without an owner: claim-checkout-dogfood.yml'
    );
  });

  it('fails once enforcing', () => {
    const result = evaluateRedMonitors({
      registry,
      observations,
      nowMs: ENFORCED_NOW,
    });
    expect(result.mode).toBe('enforcing');
    expect(result.status).toBe('fail');
    expect(redMonitorAnnotations(result)).toContain('::error::');
  });

  it('reports redHours from the first failure, falling back to the last green without redSince', () => {
    const one = {
      entries: [entry('github:jovie:nightly', 'nightly.yml')],
    };
    const streak = {
      consecutiveFailures: 5,
      countIsLowerBound: false,
      lastGreenAt: at(30),
      greenBefore: null,
      failingRunIds: [5, 4, 3, 2, 1],
    };
    const hours = s =>
      evaluateRedMonitors({
        registry: one,
        observations: new Map([['github:jovie:nightly', { streak: s }]]),
        nowMs: NOW,
      }).offenders[0].redHours;
    expect(hours({ ...streak, redSince: at(6) })).toBe(6);
    expect(hours({ ...streak, redSince: null })).toBe(30);
  });

  it('a live owner lease on an open incident covers every registry entry of that workflow', () => {
    const incidents = {
      leases: [
        lease('claim-checkout-dogfood.yml', {
          openedAt: new Date(ENFORCED_NOW - HOUR).toISOString(),
          until: new Date(ENFORCED_NOW + HOUR).toISOString(),
        }),
        lease('cost-anomaly-gate.yml', {
          openedAt: new Date(ENFORCED_NOW - HOUR).toISOString(),
          until: new Date(ENFORCED_NOW + HOUR).toISOString(),
        }),
      ],
      errors: [],
    };
    const result = evaluateRedMonitors({
      registry,
      observations,
      incidents,
      nowMs: ENFORCED_NOW,
    });
    expect(result.status).toBe('pass');
    expect(result.offenders).toEqual([]);
    expect(result.owned.map(row => row.workflow)).toEqual([
      'claim-checkout-dogfood.yml',
      'cost-anomaly-gate.yml',
    ]);
    expect(redMonitorSummary(result)).toContain(
      'Every red scheduled or post-deploy monitor'
    );
  });

  it('an expired lease is no owner', () => {
    const incidents = {
      leases: [lease('claim-checkout-dogfood.yml', { until: at(1) })],
      errors: [],
    };
    const result = evaluateRedMonitors({
      registry,
      observations,
      incidents,
      nowMs: NOW,
    });
    expect(result.offenders[0]).toMatchObject({
      workflow: 'claim-checkout-dogfood.yml',
      reason: 'lease-expired',
    });
  });

  it('a malformed incidents file is never a pass', () => {
    const quiet = observed({ 'github:jovie:nightly': [run(9, 'success', 1)] });
    const incidents = { leases: [], errors: ['line 2: not JSON'] };
    expect(
      evaluateRedMonitors({
        registry,
        observations: quiet,
        incidents,
        nowMs: NOW,
      }).status
    ).toBe('warn');
    expect(
      evaluateRedMonitors({
        registry,
        observations: quiet,
        incidents,
        nowMs: ENFORCED_NOW,
      }).status
    ).toBe('fail');
  });
});

describe('automation-liveness wiring', () => {
  it('runLiveness reports a red post-deploy monitor from the same runs page it already reads', async () => {
    const dogfood = entry(
      'github:jovie:claim-checkout-dogfood',
      'claim-checkout-dogfood.yml',
      'github-event'
    );
    const page = {
      workflow_runs: [
        run(4, 'failure', 1),
        run(3, 'failure', 2),
        run(2, 'failure', 3),
        run(1, 'failure', 4),
        run(0, 'success', 30),
      ],
    };
    const urls = [];
    const fetchImpl = async url => {
      urls.push(url);
      return { status: 200, json: async () => page };
    };
    const { report } = await runLiveness({
      registry: { entries: [dogfood] },
      fetchImpl,
      nowMs: NOW,
      lsRemote: async () => null,
      incidents: { leases: [], errors: [] },
    });
    expect(urls).toHaveLength(1);
    expect(report.redMonitors.offenders).toEqual([
      expect.objectContaining({
        workflow: 'claim-checkout-dogfood.yml',
        consecutiveFailures: 4,
        reason: 'no-incident',
        // Red since the first failure 4h ago, not since the green 30h ago.
        redHours: 4,
      }),
    ]);
  });
});
