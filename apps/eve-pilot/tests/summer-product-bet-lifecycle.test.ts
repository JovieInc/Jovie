import { describe, expect, it } from 'vitest';
import {
  admitProductBet,
  type Capacity,
  type ProductBetContract,
  type ProductBetEvent,
  productBetEventSchema,
  projectProductBet,
} from '../agent/lib/summer-product-bet-lifecycle';

const capacity = (over: Partial<Capacity> = {}): Capacity => ({
  activeBets: 0,
  wipLimit: 3,
  remainingSpendCents: 100_000,
  remainingFounderMinutes: 600,
  ...over,
});

function contract(over: Partial<ProductBetContract> = {}): ProductBetContract {
  return {
    schema: 'jovie.summer.product-bet-contract/v1',
    betId: 'bet-activation-1',
    strategyRef: 'linear:JOV-6471/strategy-rev-1',
    customerJobRef: 'linear:JOV-6472/job-new-artist-activation',
    hypothesis: 'A shorter first-release checklist raises activation.',
    baseline: 'Current activation 20% within 7 days.',
    desiredOutcome: 'Activation 35% within 7 days for cohort c1.',
    evidence: [
      {
        id: 'ev-1',
        sourceRef: 'https://records.example/ev/1',
        supports: true,
        summary: 'Interview drop-off at step 3.',
      },
    ],
    alternatives: [
      {
        id: 'alt-1',
        summary: 'Keep incumbent onboarding.',
        expectedValue: null,
        sourceRef: 'https://records.example/alt/1',
      },
    ],
    uncertainty: 'Attribution window overlaps a pricing change.',
    prediction: {
      predictedAt: '2026-09-20T00:00:00Z',
      metric: 'activation-7d',
      expectedValue: 0.35,
      sourceRef: 'https://records.example/pred/1',
    },
    cheapestTest: 'Flag-gated checklist for cohort c1.',
    owner: 'owner-summer',
    cohort: {
      id: 'c1',
      scope: 'new-signups',
      revision: 'rev-1',
      minUsefulSize: 4,
    },
    observationHorizon: '2026-10-01T00:00:00Z',
    authority: 'founder',
    limits: {
      exposureUnits: 500,
      effortMinutes: 1200,
      spendCents: 0,
      founderMinutes: 60,
    },
    guardrails: ['no p95 latency regression above 5%'],
    reversible: true,
    stopRule: 'Stop if guardrail trips twice.',
    continueRule: 'Continue if activation delta within ±5%.',
    scaleRule: 'Scale if activation ≥35% with no guardrail trip.',
    assessment: {
      customerValue: 'positive',
      usability: 'positive',
      feasibility: 'positive',
      businessViability: 'unknown',
    },
    unknowns: ['long-run retention effect'],
    retrospective: false,
    decidedAt: '2026-09-21T00:00:00Z',
    decidedBy: 'founder-tim',
    approvalValidUntil: '2026-12-31T00:00:00Z',
    ...over,
  };
}

const ev = (partial: Partial<ProductBetEvent> & { kind: string }) =>
  productBetEventSchema.parse({
    schema: 'jovie.summer.product-bet-event/v1',
    eventId: `e-${Math.random().toString(36).slice(2)}`,
    betId: 'bet-activation-1',
    occurredAt: '2026-09-25T00:00:00Z',
    ...partial,
  } as ProductBetEvent);

describe('admitProductBet', () => {
  it('admits a well-formed contract within limits', () => {
    const result = admitProductBet(contract(), capacity());
    expect(result.admitted).toBe(true);
  });

  it('rejects a prediction recorded after the decision', () => {
    const c = contract();
    const result = admitProductBet(
      {
        ...c,
        prediction: { ...c.prediction, predictedAt: '2026-09-22T00:00:00Z' },
      },
      capacity()
    );
    expect(result).toMatchObject({
      admitted: false,
      reasons: ['prediction-must-precede-decision'],
    });
  });

  it('rejects a stale approval', () => {
    const result = admitProductBet(
      contract({ approvalValidUntil: '2026-09-20T00:00:00Z' }),
      capacity()
    );
    expect(result.admitted).toBe(false);
    if (!result.admitted) expect(result.reasons).toContain('stale-approval');
  });

  it('enforces WIP and budget limits', () => {
    const c = contract();
    expect(admitProductBet(c, capacity({ activeBets: 3 })).admitted).toBe(
      false
    );
    const tight = admitProductBet(
      {
        ...c,
        limits: { ...c.limits, spendCents: 200_000, founderMinutes: 700 },
      },
      capacity()
    );
    expect(tight.admitted).toBe(false);
    if (!tight.admitted) {
      expect(tight.reasons).toEqual(
        expect.arrayContaining([
          'spend-budget-exceeded',
          'founder-time-budget-exceeded',
        ])
      );
    }
  });

  it('requires human authority for irreversible live bets', () => {
    const result = admitProductBet(
      contract({ reversible: false, authority: 'automation' }),
      capacity()
    );
    expect(result.admitted).toBe(false);
    if (!result.admitted) {
      expect(result.reasons).toContain('irreversible-requires-human-authority');
    }
  });
});

describe('projectProductBet', () => {
  it('keeps a delivered bet pending without customer outcome', () => {
    const p = projectProductBet(contract(), [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
    ]);
    expect(p.delivered?.runtimeProofRef).toBe('deploy:sha-abc');
    expect(p.customerOutcomeReached).toBe(false);
    expect(p.evaluation).toBe('pending');
    // Engineering may close while the business bet stays pending.
    expect(p.route).toBe('none');
  });

  it('classifies failed telemetry at horizon as unmeasurable, not failure', () => {
    const p = projectProductBet(contract(), [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
      ev({
        kind: 'telemetry-failure',
        instrumentationRef: 'https://records.example/tel/1',
        occurredAt: '2026-10-02T00:00:00Z',
      }),
    ]);
    expect(p.evaluation).toBe('unmeasurable-instrumentation-failed');
    expect(p.route).toBe('repair');
  });

  it('treats delayed payment/retention inside an open attribution window as awaiting-maturity', () => {
    const events = [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
      ...[1, 2, 3, 4].map(n =>
        ev({
          kind: 'customer-outcome',
          cohortMemberId: `m${n}`,
          usefulResult: true,
          resultRef: `https://records.example/co/${n}`,
        })
      ),
      ev({
        kind: 'business-outcome',
        metric: 'activation-7d',
        observedValue: 0.4,
        evidenceRef: 'https://records.example/bo/1',
        attributionWindowClosed: false,
        occurredAt: '2026-10-02T00:00:00Z',
      }),
    ];
    const p = projectProductBet(contract(), events);
    expect(p.evaluation).toBe('awaiting-maturity');
    expect(p.reconsiderationTrigger).toMatch(/^horizon:/u);
  });

  it('deduplicates repeated conversion events idempotently', () => {
    const dup = ev({
      kind: 'customer-outcome',
      eventId: 'e-dup',
      cohortMemberId: 'm1',
      usefulResult: true,
      resultRef: 'https://records.example/co/1',
    });
    const events = [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
      dup,
      { ...dup },
      ...[2, 3, 4].map(n =>
        ev({
          kind: 'customer-outcome',
          cohortMemberId: `m${n}`,
          usefulResult: n !== 4,
          resultRef: `https://records.example/co/${n}`,
          occurredAt: '2026-09-24T00:00:00Z',
        })
      ),
      ev({
        kind: 'business-outcome',
        metric: 'activation-7d',
        observedValue: 0.38,
        evidenceRef: 'https://records.example/bo/1',
        attributionWindowClosed: true,
        occurredAt: '2026-10-02T00:00:00Z',
      }),
    ];
    const p = projectProductBet(contract(), events);
    expect(p.observedCohortSize).toBe(4);
    expect(p.usefulResultCount).toBe(3);
    expect(p.evaluation).toBe('supported');
    expect(p.route).toBe('continue');
  });

  it('routes a negative result to customer/problem/offer review', () => {
    const events = [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
      ...[1, 2, 3, 4].map(n =>
        ev({
          kind: 'customer-outcome',
          cohortMemberId: `m${n}`,
          usefulResult: false,
          resultRef: `https://records.example/co/${n}`,
        })
      ),
      ev({
        kind: 'business-outcome',
        metric: 'activation-7d',
        observedValue: 0.1,
        evidenceRef: 'https://records.example/bo/neg',
        attributionWindowClosed: true,
        occurredAt: '2026-10-02T00:00:00Z',
      }),
    ];
    const p = projectProductBet(contract(), events);
    expect(p.evaluation).toBe('contradicted');
    expect(p.route).toBe('customer-problem-offer-review');
    expect(p.destructiveActionAuthorized).toBe(false);
  });

  it('marks a lucky outcome with poor evidence inconclusive, not supported', () => {
    const p = projectProductBet(contract(), [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
      ev({
        kind: 'business-outcome',
        metric: 'activation-7d',
        observedValue: 0.9,
        evidenceRef: 'https://records.example/bo/lucky',
        attributionWindowClosed: true,
        occurredAt: '2026-10-02T00:00:00Z',
      }),
    ]);
    expect(p.evaluation).toBe('inconclusive');
    expect(p.route).toBe('evidence-collection');
    expect(p.reconsiderationTrigger).toBe('evidence-arrival');
  });

  it('routes guardrail failure to repair and never authorizes destruction', () => {
    const p = projectProductBet(contract(), [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
      ev({
        kind: 'guardrail-trip',
        guardrail: 'no p95 latency regression above 5%',
        detailRef: 'https://records.example/g/1',
      }),
    ]);
    expect(p.guardrailTripped).toBe(true);
    expect(p.evaluation).toBe('contradicted');
    expect(p.route).toBe('repair');
    expect(p.destructiveActionAuthorized).toBe(false);
  });

  it('flags stale approval when events land after expiry', () => {
    const p = projectProductBet(
      contract({ approvalValidUntil: '2026-09-24T00:00:00Z' }),
      [ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' })]
    );
    expect(p.staleApproval).toBe(true);
  });

  it('handles restarted observation with a new horizon', () => {
    const events = [
      ev({ kind: 'delivered', runtimeProofRef: 'deploy:sha-abc' }),
      ev({
        kind: 'telemetry-failure',
        instrumentationRef: 'https://records.example/tel/1',
      }),
      ev({
        kind: 'observation-restarted',
        newHorizon: '2026-11-01T00:00:00Z',
        reasonRef: 'https://records.example/restart/1',
        occurredAt: '2026-09-26T00:00:00Z',
      }),
      ev({
        kind: 'customer-outcome',
        cohortMemberId: 'm1',
        usefulResult: true,
        resultRef: 'https://records.example/co/1',
        occurredAt: '2026-09-27T00:00:00Z',
      }),
    ];
    const p = projectProductBet(contract(), events);
    expect(p.observedCohortSize).toBe(1);
    expect(p.evaluation).toBe('awaiting-maturity');
    expect(p.reconsiderationTrigger).toBe('horizon:2026-11-01T00:00:00.000Z');
  });
});
