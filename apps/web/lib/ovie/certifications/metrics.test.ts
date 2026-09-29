import { describe, expect, it } from 'vitest';
import {
  buildDogfoodReceipt,
  type DogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';
import {
  CERTIFICATION_METRICS_CONTRACT,
  type CertificationMetricsInput,
  computeCertificationMetrics,
  type MetricsSubject,
} from './metrics';

const NOW = '2026-09-29T12:00:00.000Z';
const WINDOW_START = '2026-09-01T12:00:00.000Z'; // 28 days
const SHA = 'a'.repeat(40);
const DEPLOY = { commitSha: SHA, deploymentId: 'dep-1' };

function subject(overrides: Partial<MetricsSubject> = {}): MetricsSubject {
  return {
    id: 'sub-1',
    product: 'jov',
    riskClass: 'product',
    requiredMissions: [],
    deploy: null,
    confidenceTier: null,
    machineCertifiedAt: null,
    fullyRolledOutAt: null,
    promotedSilently: false,
    killedAfterPromotion: false,
    founderFlaggedAfterPromotion: false,
    founderBlocking: [],
    killSwitches: [],
    escalationRungResolved: null,
    hasCanary: false,
    ...overrides,
  };
}

function receipt(overrides: Partial<DogfoodReceipt> = {}): DogfoodReceipt {
  return buildDogfoodReceipt({
    subjectId: 'sub-1',
    product: 'jov',
    kind: 'ui_agent',
    driver: 'playwright',
    missionId: 'm-1',
    actor: 'summer',
    environment: 'production',
    deploymentId: DEPLOY.deploymentId,
    commitSha: DEPLOY.commitSha,
    flagCohort: 'dogfood',
    startedAt: '2026-09-28T10:00:00.000Z',
    completedAt: '2026-09-28T10:05:00.000Z',
    outcome: 'passed',
    ...overrides,
  });
}

function input(overrides: Partial<CertificationMetricsInput> = {}) {
  return computeCertificationMetrics({
    generatedAt: NOW,
    windowStart: WINDOW_START,
    subjects: [],
    defects: [],
    founderCards: [],
    judgeReceipts: [],
    decisions: [],
    signalReports: [],
    roster: [],
    receipts: [],
    knownGoodDeploymentIds: [],
    ...overrides,
  });
}

describe('computeCertificationMetrics', () => {
  it('reports the contract and every lane with null metrics on empty input', () => {
    const result = input();
    expect(result.contract).toBe(CERTIFICATION_METRICS_CONTRACT);
    expect(Object.keys(result.lanes).sort()).toEqual(['jov', 'lyb', 'ovie']);
    const jov = result.lanes.jov;
    expect(jov.founderBlockingMinutes).toBe(0);
    expect(jov.founderCardsPerDay).toEqual({ value: 0, sampleSize: 0 });
    expect(jov.silencePromotionRegretPer100.value).toBeNull();
    expect(jov.machineCertifiableCoverage.value).toBeNull();
    expect(jov.byRiskClass.money_path.canaryCoverage.value).toBeNull();
  });

  it('sums founder-blocking minutes including open intervals', () => {
    const result = input({
      subjects: [
        subject({
          founderBlocking: [
            {
              startedAt: '2026-09-29T10:00:00.000Z',
              endedAt: '2026-09-29T11:00:00.000Z',
            },
            // Still waiting only on Tim: counted through generatedAt.
            { startedAt: '2026-09-29T11:30:00.000Z', endedAt: null },
          ],
        }),
      ],
    });
    expect(result.lanes.jov.founderBlockingMinutes).toBe(90);
  });

  it('rates founder cards per day over the reporting window', () => {
    const result = input({
      subjects: [subject()],
      founderCards: [
        {
          id: 'c1',
          subjectId: 'sub-1',
          product: 'jov',
          createdAt: '2026-09-10T00:00:00.000Z',
        },
        {
          id: 'c2',
          subjectId: 'sub-1',
          product: 'jov',
          createdAt: '2026-09-20T00:00:00.000Z',
        },
        // Outside the window: excluded.
        {
          id: 'c3',
          subjectId: 'sub-1',
          product: 'jov',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });
    expect(result.lanes.jov.founderCardsPerDay).toEqual({
      value: 2 / 28,
      sampleSize: 2,
    });
  });

  it('counts silence-promotion regret per 100 silent promotions', () => {
    const result = input({
      subjects: [
        subject({
          id: 'a',
          promotedSilently: true,
          killedAfterPromotion: true,
        }),
        subject({ id: 'b', promotedSilently: true }),
        subject({
          id: 'c',
          promotedSilently: true,
          founderFlaggedAfterPromotion: true,
        }),
        subject({ id: 'd' }),
      ],
    });
    expect(result.lanes.jov.silencePromotionRegretPer100).toEqual({
      value: (2 / 3) * 100,
      sampleSize: 3,
    });
  });

  it('rates escaped defects at-or-after beta per 100 promotions, per lane and risk class', () => {
    const result = input({
      subjects: [
        subject({ id: 'a', fullyRolledOutAt: '2026-09-20T00:00:00.000Z' }),
        subject({ id: 'b', fullyRolledOutAt: '2026-09-21T00:00:00.000Z' }),
        subject({
          id: 'c',
          product: 'lyb',
          riskClass: 'money_path',
          fullyRolledOutAt: '2026-09-22T00:00:00.000Z',
        }),
        subject({ id: 'd' }), // never promoted: not a denominator
      ],
      defects: [
        { id: 'd1', subjectId: 'a', stage: 'beta', open: false },
        { id: 'd2', subjectId: 'a', stage: 'dogfooding', open: false },
        { id: 'd3', subjectId: 'b', stage: 'dogfooding', open: true },
        { id: 'd4', subjectId: 'c', stage: '50%', open: false },
        // Defect on an unpromoted subject never counts.
        { id: 'd5', subjectId: 'd', stage: '100%', open: false },
      ],
    });
    const jov = result.lanes.jov;
    expect(jov.escapedDefectsPer100Promotions).toEqual({
      value: 50,
      sampleSize: 2,
    });
    expect(jov.dogfoodCatchRate).toEqual({ value: 2 / 3, sampleSize: 3 });
    expect(jov.byRiskClass.product.escapedDefectsPer100Promotions.value).toBe(
      50
    );
    expect(
      jov.byRiskClass.money_path.escapedDefectsPer100Promotions.value
    ).toBeNull();
    expect(result.lanes.lyb.escapedDefectsPer100Promotions).toEqual({
      value: 100,
      sampleSize: 1,
    });
    expect(result.lanes.lyb.byRiskClass.money_path.dogfoodCatchRate).toEqual({
      value: 0,
      sampleSize: 1,
    });
  });

  it('measures machine-certifiable coverage via the reliability rule on the exact deploy', () => {
    const missions = [{ id: 'm-1' }];
    const passes = [0, 1, 2].map(index =>
      receipt({
        missionId: 'm-1',
        completedAt: `2026-09-28T10:0${index}:00.000Z`,
      })
    );
    const result = input({
      subjects: [
        subject({
          id: 'certifiable',
          requiredMissions: missions,
          deploy: DEPLOY,
        }),
        subject({ id: 'other', requiredMissions: missions, deploy: DEPLOY }),
      ],
      receipts: passes.map(r => ({ ...r, subjectId: 'certifiable' })),
    });
    expect(result.lanes.jov.machineCertifiableCoverage).toEqual({
      value: 0.5,
      sampleSize: 2,
    });
  });

  it('averages distinct passing dogfood kinds per identity', () => {
    const result = input({
      subjects: [subject({ id: 'a' }), subject({ id: 'b' })],
      receipts: [
        receipt({ subjectId: 'a', kind: 'ui_agent' }),
        receipt({ subjectId: 'a', kind: 'agent_on_behalf', driver: 'mcp' }),
        receipt({
          subjectId: 'a',
          kind: 'local_agent',
          outcome: 'failed', // failed receipts do not count
        }),
        receipt({ subjectId: 'b', kind: 'ui_agent' }),
        // Receipt on a different deploy does not count toward kind coverage.
        receipt({
          subjectId: 'b',
          kind: 'instincts',
          deploymentId: 'dep-old',
          commitSha: 'b'.repeat(40),
        }),
      ],
    });
    // a: ui_agent + agent_on_behalf (kinds bound to deploy only when subject
    // has a binding; these subjects have none, so passes count) — but the
    // stale-deploy receipt for b is excluded only when b has a binding.
    expect(result.lanes.jov.dogfoodKindCoverage).toEqual({
      value: 2,
      sampleSize: 2,
    });
  });

  it('excludes receipts on other deploys from kind coverage when a binding exists', () => {
    const result = input({
      subjects: [subject({ id: 'a', deploy: DEPLOY })],
      receipts: [
        receipt({ subjectId: 'a', kind: 'ui_agent' }),
        receipt({
          subjectId: 'a',
          kind: 'instincts',
          deploymentId: 'dep-old',
          commitSha: 'b'.repeat(40),
        }),
      ],
    });
    expect(result.lanes.jov.dogfoodKindCoverage.value).toBe(1);
  });

  it('reports driver pass rate on known-good builds only', () => {
    const result = input({
      subjects: [subject()],
      knownGoodDeploymentIds: [DEPLOY.deploymentId],
      receipts: [
        receipt({ driver: 'playwright', outcome: 'passed' }),
        receipt({ driver: 'playwright', outcome: 'failed' }),
        receipt({ driver: 'mcp', outcome: 'passed' }),
        // Off the known-good deploy: ignored entirely.
        receipt({
          driver: 'mcp',
          deploymentId: 'dep-x',
          commitSha: 'b'.repeat(40),
          outcome: 'failed',
        }),
      ],
    });
    const drivers = result.lanes.jov.driverReliability;
    expect(drivers.playwright).toEqual({ value: 0.5, sampleSize: 2 });
    expect(drivers.mcp).toEqual({ value: 1, sampleSize: 1 });
  });

  it('reports canary coverage', () => {
    const result = input({
      subjects: [
        subject({ id: 'a', hasCanary: true }),
        subject({ id: 'b' }),
        subject({ id: 'c', hasCanary: true }),
        subject({ id: 'd' }),
      ],
    });
    expect(result.lanes.jov.canaryCoverage).toEqual({
      value: 0.5,
      sampleSize: 4,
    });
  });

  it('calibrates each judge rung against Tim\u2019s decisions', () => {
    const result = input({
      subjects: [subject({ id: 'a' }), subject({ id: 'b' })],
      decisions: [
        {
          subjectId: 'a',
          decision: 'approved',
          decidedAt: '2026-09-28T00:00:00.000Z',
        },
        {
          subjectId: 'b',
          decision: 'rejected',
          decidedAt: '2026-09-28T00:00:00.000Z',
        },
      ],
      judgeReceipts: [
        { subjectId: 'a', rung: 1, verdict: 'certify', costUsd: 0.01 },
        { subjectId: 'b', rung: 1, verdict: 'certify', costUsd: 0.02 }, // disagrees with rejected
        { subjectId: 'b', rung: 2, verdict: 'reject', costUsd: 0.1 }, // agrees
        { subjectId: 'a', rung: 3, verdict: 'uncertain', costUsd: 0.5 }, // excluded
      ],
    });
    const calibration = result.lanes.jov.judgeCalibration;
    expect(calibration).toEqual([
      { rung: 1, agreementRate: { value: 0.5, sampleSize: 2 } },
      { rung: 2, agreementRate: { value: 1, sampleSize: 1 } },
    ]);
  });

  it('reports the escalation mix and cost per rung', () => {
    const result = input({
      subjects: [
        subject({ id: 'a', escalationRungResolved: 1 }),
        subject({ id: 'b', escalationRungResolved: 1 }),
        subject({ id: 'c', escalationRungResolved: 3 }),
        subject({ id: 'd' }), // carded to Tim, resolved at no rung
      ],
      judgeReceipts: [
        { subjectId: 'a', rung: 1, verdict: 'certify', costUsd: 0.01 },
        { subjectId: 'b', rung: 1, verdict: 'certify', costUsd: 0.03 },
        { subjectId: 'c', rung: 3, verdict: 'certify', costUsd: 0.4 },
      ],
    });
    const mix = result.lanes.jov.escalationMix;
    expect(mix).toEqual([
      { rung: 1, share: { value: 2 / 3, sampleSize: 3 }, totalCostUsd: 0.04 },
      { rung: 3, share: { value: 1 / 3, sampleSize: 3 }, totalCostUsd: 0.4 },
    ]);
  });

  it('reports cycle-time p50 and p90 per confidence tier', () => {
    const durations = [60, 120, 180, 240, 300]; // minutes
    const result = input({
      subjects: durations.map((minutes, index) =>
        subject({
          id: `s${index}`,
          confidenceTier: 'medium',
          machineCertifiedAt: '2026-09-01T00:00:00.000Z',
          fullyRolledOutAt: new Date(
            Date.parse('2026-09-01T00:00:00.000Z') + minutes * 60_000
          ).toISOString(),
        })
      ),
    });
    const medium = result.lanes.jov.cycleTime.find(
      row => row.tier === 'medium'
    );
    expect(medium).toEqual({
      tier: 'medium',
      p50Minutes: 180,
      p90Minutes: 300,
      sampleSize: 5,
    });
    const high = result.lanes.jov.cycleTime.find(row => row.tier === 'high');
    expect(high?.p50Minutes).toBeNull();
  });

  it('reports kill-switch MTTR from failure receipt to flag off', () => {
    const result = input({
      subjects: [
        subject({
          id: 'a',
          killedAfterPromotion: true,
          killSwitches: [
            {
              failedAt: '2026-09-28T00:00:00.000Z',
              flagOffAt: '2026-09-28T00:02:00.000Z',
            },
          ],
        }),
        subject({
          id: 'b',
          killedAfterPromotion: true,
          killSwitches: [
            {
              failedAt: '2026-09-28T00:00:00.000Z',
              flagOffAt: '2026-09-28T00:06:00.000Z',
            },
          ],
        }),
      ],
    });
    expect(result.lanes.jov.killSwitchMttrMinutes).toEqual({
      value: 4,
      sampleSize: 2,
    });
  });

  it('reports signal health per lane', () => {
    const result = input({
      subjects: [subject({ id: 'a' }), subject({ id: 'b' })],
      decisions: [
        {
          subjectId: 'a',
          decision: 'approved',
          decidedAt: '2026-09-28T00:00:00.000Z',
        },
        {
          subjectId: 'b',
          decision: 'rejected',
          decidedAt: '2026-09-28T00:00:00.000Z',
        },
      ],
      signalReports: [
        { subjectId: 'a', memberId: 'm1', product: 'jov', weight: 0.5 },
        { subjectId: 'b', memberId: 'm1', product: 'jov', weight: -0.5 },
      ],
      roster: [
        {
          id: 'm1',
          products: ['jov'],
          tier: 'advisor',
          signalState: 'qualified',
          reportsSent: 10,
          repliesReceived: 8,
        },
        {
          id: 'm2',
          products: ['jov'],
          tier: 'alpha',
          signalState: 'qualified',
          reportsSent: 5,
          repliesReceived: 1,
        },
        {
          id: 'm3',
          products: ['jov'],
          tier: 'beta',
          signalState: 'calibrating', // not yet qualified
          reportsSent: 0,
          repliesReceived: 0,
        },
      ],
    });
    const health = result.lanes.jov.signalHealth;
    expect(health.advisors).toBe(1);
    expect(health.qualifiedPoolMembers).toBe(1);
    expect(health.replyRate).toEqual({ value: 9 / 15, sampleSize: 15 });
    expect(health.agreementWithTim).toEqual({ value: 1, sampleSize: 2 });
  });

  it('keeps lanes independent', () => {
    const result = input({
      subjects: [
        subject({
          id: 'a',
          product: 'jov',
          fullyRolledOutAt: '2026-09-20T00:00:00.000Z',
        }),
        subject({ id: 'b', product: 'lyb' }),
      ],
      defects: [{ id: 'd1', subjectId: 'a', stage: '100%', open: false }],
    });
    expect(result.lanes.jov.escapedDefectsPer100Promotions.value).toBe(100);
    expect(result.lanes.lyb.escapedDefectsPer100Promotions.value).toBeNull();
    expect(result.lanes.ovie.machineCertifiableCoverage.value).toBeNull();
  });
});
