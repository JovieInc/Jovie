import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../../shipping-slo-report.mjs';
import {
  doraMetrics,
  flattenDora,
  lanesFlowBlock,
  productionPromotions,
  revertedPrNumber,
} from '../shipping-slo.mjs';
import { defFor, validateBaseline } from '../shipping-slo-baseline.mjs';

const NOW = Date.parse('2026-11-22T00:00:00Z');
const H = 3_600_000;
const at = hoursAgo => new Date(NOW - hoursAgo * H).toISOString();
const SINCE = NOW - 7 * 24 * H;
const sha = c => c.repeat(40);

const job = (name, conclusion, completedHoursAgo) => ({
  name,
  conclusion,
  startedAt: at(completedHoursAgo + 0.2),
  completedAt: at(completedHoursAgo),
});
const promote = (h, conclusion = 'SUCCESS') =>
  job('Production Release / Promote to Production', conclusion, h);
const run = (id, c, createdHoursAgo, jobs, conclusion = 'success') => ({
  id,
  headSha: sha(c),
  conclusion,
  createdAt: at(createdHoursAgo),
  jobs,
});
const pr = (number, title, mergedHoursAgo, mergeSha = null) => ({
  number,
  title,
  createdAt: at(mergedHoursAgo + 1),
  mergedAt: at(mergedHoursAgo),
  mergeCommitSha: mergeSha,
});

describe('productionPromotions', () => {
  it('collapses reruns of one generation to its earliest successful promote', () => {
    const rows = productionPromotions([
      run(1, 'a', 10, [promote(9)]),
      run(2, 'a', 8, [promote(7)]),
      run(3, 'b', 6, [promote(5, 'SKIPPED')]),
      run(4, 'c', 4, [promote(3, 'success')], 'failure'),
    ]);
    expect(rows.map(r => r.sha[0])).toEqual(['c', 'a']);
    expect(rows[1].liveAt).toBe(at(9));
    expect(rows[1].runIds).toEqual([1, 2]);
  });

  it('judges probes on their latest attempt and records flakes', () => {
    const smoke = 'Post-Deploy Smoke (Production)';
    const [row] = productionPromotions([
      run(1, 'a', 10, [
        promote(9),
        job(smoke, 'FAILURE', 8.5),
        job(smoke, 'SUCCESS', 8),
        job(
          'Production Release / Sentry Error Gate (production)',
          'TIMED_OUT',
          8
        ),
      ]),
    ]);
    expect(row.flakedProbes).toEqual([smoke]);
    expect(row.failedProbes).toEqual([
      'Production Release / Sentry Error Gate (production)',
    ]);
  });
});

describe('blocked and unverified promotions', () => {
  it('keeps gate-blocked promotes and Lighthouse-only failures out of CFR', () => {
    const dora = doraMetrics({
      runs: [
        run(1, 'a', 30, [promote(29, 'FAILURE')], 'failure'),
        run(2, 'a', 28, [promote(27, 'FAILURE')], 'failure'),
        run(
          3,
          'b',
          26,
          [
            promote(25),
            job('Lighthouse CI (Production)', 'FAILURE', 24.8),
            job('Production Verified', 'FAILURE', 24.5),
          ],
          'failure'
        ),
      ],
      mergedPrs: [pr(1, 'feat: x', 40)],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(dora.deployFrequency).toMatchObject({
      promotions: 1,
      blockedGenerations: 1,
      blockedAttempts: 2,
    });
    expect(dora.changeFailureRate).toMatchObject({
      rate: 0,
      failed: 0,
      unverified: 1,
    });
  });
});

describe('revertedPrNumber', () => {
  it('reads GitHub, conventional and bare revert titles', () => {
    expect(
      revertedPrNumber('Revert "fix(x): y (#24830)" (#24976)', 24976)
    ).toBe(24830);
    expect(revertedPrNumber('revert(main-red): y (#25001)', 25002)).toBe(25001);
    expect(revertedPrNumber('revert(shell): restore it', 25807)).toBeNull();
    expect(
      revertedPrNumber('revert(shell): restore it (#25807)', 25807)
    ).toBeNull();
  });
});

describe('doraMetrics', () => {
  const healthy = (id, c, h) => run(id, c, h + 1, [promote(h)]);

  it('counts deploy frequency over promotions live in the window only', () => {
    const dora = doraMetrics({
      runs: [
        healthy(1, 'a', 200), // outside the 7d window
        healthy(2, 'b', 100),
        healthy(3, 'c', 50),
        run(4, 'c', 40, [promote(39)]), // rerun of c
      ],
      mergedPrs: [pr(1, 'feat: x', 120)],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(dora.deployFrequency).toMatchObject({ promotions: 2, reason: null });
    expect(dora.deployFrequency.perDay).toBeCloseTo(2 / 7);
    expect(dora.changeFailureRate).toMatchObject({ rate: 0, failed: 0 });
    expect(dora.recovery).toMatchObject({
      n: 0,
      p95: null,
      reason: 'no failed deployments in window',
    });
  });

  it('marks rollback, probe and revert failures and times each recovery', () => {
    const runs = [
      // Rolled back: recovery ends at the rollback's completion.
      run(1, 'a', 101, [
        promote(100),
        job(
          'Production Release / Centralized production rollback',
          'SUCCESS',
          99.5
        ),
      ]),
      // Failed probe: recovers at the next promotion without a failure.
      run(2, 'b', 81, [
        promote(80),
        job('Post-Deploy Auth Smoke (Production)', 'FAILURE', 79.8),
      ]),
      healthy(3, 'c', 78),
      // d ships #10 and #11 is its revert 5h later; e still carries #10,
      // f contains the revert and restores service.
      healthy(4, 'd', 60),
      healthy(5, 'e', 58),
      healthy(6, 'f', 54),
      // g failed and nothing healthy followed yet: open.
      run(7, 'g', 3, [
        promote(2),
        job('Post-Deploy Smoke (Production)', 'FAILURE', 1.8),
      ]),
    ];
    const mergedPrs = [
      pr(9, 'feat: c', 79, sha('c')),
      pr(10, 'feat: risky', 61.5),
      pr(12, 'feat: d', 61, sha('d')),
      pr(13, 'feat: e', 57, sha('e')),
      pr(11, 'Revert "feat: risky (#10)"', 55),
      pr(14, 'feat: f', 54.5, sha('f')),
      pr(15, 'revert(ui): no reference', 20),
    ];
    const dora = doraMetrics({ runs, mergedPrs, sinceMs: SINCE, nowMs: NOW });
    expect(dora.deployFrequency.promotions).toBe(7);
    expect(dora.changeFailureRate).toMatchObject({
      failed: 4,
      promotions: 7,
      provisional: 1,
    });
    expect(dora.changeFailureRate.rate).toBeCloseTo(4 / 7);
    const bySha = Object.fromEntries(dora.failures.map(f => [f.sha[0], f]));
    expect(bySha.a).toMatchObject({
      causes: ['rollback'],
      recoverySeconds: 1800,
    });
    expect(bySha.b).toMatchObject({
      causes: ['probe'],
      recoverySeconds: 2 * 3600,
    });
    expect(bySha.d).toMatchObject({
      causes: ['revert'],
      reverts: [{ revert: 11, reverted: 10 }],
      recoverySeconds: 6 * 3600,
    });
    expect(bySha.g).toMatchObject({ restoredAt: null, recoverySeconds: null });
    expect(dora.recovery).toMatchObject({ n: 3, open: 1, p95: 6 * 3600 });
    expect(dora.unattributedReverts).toEqual([
      { number: 15, reason: 'revert names no PR' },
    ]);
  });

  it('ignores reverts outside the failure window or shipped with the change', () => {
    const dora = doraMetrics({
      runs: [run(1, 'a', 101, [promote(100)]), run(2, 'b', 31, [promote(30)])],
      mergedPrs: [
        pr(1, 'feat: late', 102),
        pr(2, 'Revert "feat: late (#1)"', 60), // 40h after a went live
        pr(3, 'feat: quick', 33),
        pr(4, 'revert(main-red): quick (#3)', 32, sha('b')), // b ships both
      ],
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(dora.changeFailureRate.failed).toBe(0);
  });

  it('is null with a reason, never zero, when inputs are missing', () => {
    const base = { mergedPrs: [pr(1, 'x', 5)], sinceMs: SINCE, nowMs: NOW };
    expect(doraMetrics({ ...base, runs: undefined }).deployFrequency).toEqual({
      perDay: null,
      promotions: null,
      reason: 'production controller runs not collected',
    });
    expect(
      doraMetrics({
        ...base,
        runs: [run(1, 'a', 5, [promote(4)])],
        controllerSource: { ok: false, error: 'HTTP 502' },
      }).changeFailureRate.reason
    ).toBe('production controller collection failed: HTTP 502');
    expect(
      doraMetrics({ ...base, runs: [run(1, 'a', 5, [])] }).deployFrequency
        .reason
    ).toBe('production controller jobs not collected');
    expect(doraMetrics({ ...base, runs: [] }).deployFrequency.reason).toBe(
      'no production controller runs in window'
    );
    const noPrs = doraMetrics({
      ...base,
      mergedPrs: [],
      runs: [run(1, 'a', 5, [promote(4)])],
    });
    expect(noPrs.deployFrequency.promotions).toBe(1);
    expect(noPrs.changeFailureRate).toMatchObject({
      rate: null,
      reason: 'merged PRs not collected; reverts cannot be attributed',
    });
    expect(flattenDora(noPrs)['dora.change_failure_rate']).toBeNull();
  });
});

// The DORA keys are reported in the snapshot but not ratcheted yet: adding
// them to METRIC_DEFS grows a shrink-only baseline module, which needs a
// gate-change review. Until then the committed baseline must stay valid.
describe('DORA metric definitions', () => {
  it('reports DORA keys without ratcheting them, and keeps the baseline valid', () => {
    expect(defFor('dora.deploy_frequency.per_day')).toBeUndefined();
    expect(defFor('dora.change_failure_rate')).toBeUndefined();
    expect(defFor('dora.failed_deployment_recovery.p95')).toBeUndefined();
    const committed = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../../../docs/metrics/shipping-slo-baseline.json'
        ),
        'utf8'
      )
    );
    expect(validateBaseline(committed)).toEqual({ ok: true, errors: [] });
  });
});

describe('buildReport DORA wiring', () => {
  const stages = productionUnsuccessful => ({
    sources: { 'github-controller': { ok: true, n: 2 } },
    controllers: {
      production: [run(1, 'a', 30, [promote(29)])],
      ...(productionUnsuccessful ? { productionUnsuccessful } : {}),
      staging: [],
    },
  });
  const raw = extra => ({
    runs: { pull_request: [], merge_group: [], main: [] },
    mergedPrs: [pr(1, 'feat: x', 40)],
    timelines: {},
    ...extra,
  });

  it('puts the DORA keys in flat values, history input and the latest block', () => {
    const report = buildReport(
      raw({
        stages: stages([
          run(
            2,
            'b',
            20,
            [
              promote(19),
              job('Post-Deploy Smoke (Production)', 'FAILURE', 18.5),
            ],
            'failure'
          ),
        ]),
      }),
      { schemaVersion: 1, metrics: {} },
      { now: NOW }
    );
    expect(report.flat['dora.deploy_frequency.per_day']).toBeCloseTo(2 / 7);
    expect(report.flat['dora.change_failure_rate']).toBe(0.5);
    expect(report.flat['dora.failed_deployment_recovery.p95']).toBeNull();
    expect(report.gistSlo.dora).toMatchObject({
      promotions: 2,
      failedDeployments: 1,
      failedDeploymentRecovery: { n: 0, open: 1 },
    });
    expect(report.gistSlo.lanes).toEqual({
      teams: {},
      reason: 'no lanes doctor snapshot supplied',
    });
    expect(report.sampled.productionControllerRuns).toBe(2);
  });

  it('reads as not measured without stages or from a pre-DORA snapshot', () => {
    const none = buildReport(
      raw({}),
      { schemaVersion: 1, metrics: {} },
      { now: NOW }
    );
    expect(none.flat['dora.deploy_frequency.per_day']).toBeNull();
    expect(none.gistSlo.dora.reasons.deployFrequency).toBe(
      'production controller runs not collected'
    );
    const old = buildReport(
      raw({ stages: stages(null) }),
      { schemaVersion: 1, metrics: {} },
      { now: NOW }
    );
    expect(old.gistSlo.dora.reasons.changeFailureRate).toBe(
      'unsuccessful production controller runs not collected'
    );
  });
});

describe('lanesFlowBlock', () => {
  it('keeps the measure fields and marks stale teams', () => {
    const block = lanesFlowBlock(
      {
        jov: {
          at: (NOW - 2 * H) / 1000,
          lanes: {
            build: {
              queued: 3,
              started: 1,
              blocked: 1,
              oldestQueuedH: 30.5,
              stuck: false,
              extra: 'x',
            },
          },
        },
        lyb: { at: new Date(NOW - 50 * H).toISOString(), lanes: {} },
      },
      { nowMs: NOW }
    );
    expect(block.teams.jov.stale).toBe(false);
    expect(block.teams.jov.lanes.build).toMatchObject({
      queued: 3,
      oldestQueuedH: 30.5,
      p50QueuedH: null,
      stuck: false,
    });
    expect(block.teams.jov.lanes.build.extra).toBeUndefined();
    expect(block.teams.lyb.stale).toBe(true);
  });
});
