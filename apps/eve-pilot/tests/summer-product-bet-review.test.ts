import { describe, expect, it } from 'vitest';
import type { ProductBetContract } from '../agent/lib/summer-product-bet-lifecycle';
import { projectProductBet } from '../agent/lib/summer-product-bet-lifecycle';
import {
  type ActivationPilotWriteback,
  activationPilotWritebackSchema,
  type BetDecision,
  betDecisionCardView,
  eventsFromActivationWriteback,
  recordBetDecision,
} from '../agent/lib/summer-product-bet-review';

/**
 * The JOV-6468 activation pilot bound as a JOV-6473 product bet. Refs point
 * at the real commissioning issues and the pilot spec; timestamps reflect
 * the frozen spec (prediction precedes the admitted decision).
 */
function contract(over: Partial<ProductBetContract> = {}): ProductBetContract {
  return {
    schema: 'jovie.summer.product-bet-contract/v1',
    betId: 'bet-jov-6468-activation',
    strategyRef: 'linear:JOV-6471/strategy-current',
    customerJobRef: 'linear:JOV-6472/job-premade-profile-claim-first-value',
    hypothesis:
      'A delayed contextual help nudge on the claim flow raises 72h activation.',
    baseline: 'Claimed premade profiles that never reach first value in 72h.',
    desiredOutcome:
      'Challenger arm lifts activated-within-72h by >=5pp ITT vs incumbent.',
    evidence: [
      {
        id: 'ev-discovery',
        sourceRef: 'linear:JOV-6472/evidence-claim-dropoff',
        supports: true,
        summary: 'Claimed profiles stall before first value.',
      },
    ],
    alternatives: [
      {
        id: 'alt-incumbent',
        summary: 'Retain the current claim → activate flow.',
        expectedValue: null,
        sourceRef: 'linear:JOV-6468/spec-incumbent',
      },
    ],
    uncertainty: 'Attribution window overlaps unrelated onboarding changes.',
    prediction: {
      predictedAt: '2026-09-19T00:00:00Z',
      metric: 'activated-72h-itt-effect',
      expectedValue: 0.05,
      sourceRef: 'linear:JOV-6466/prediction-receipt-activation-pilot',
    },
    cheapestTest:
      'Flag-gated challenger on premade-artist-profile/v1 cohort only.',
    owner: 'owner-activation',
    cohort: {
      id: 'premade-artist-profile-v1',
      scope: 'claimed premade profiles, consented, non-staff',
      revision: 'claim-flow/v2026-09',
      minUsefulSize: 100,
    },
    observationHorizon: '2026-10-04T00:00:00Z',
    authority: 'founder',
    limits: {
      exposureUnits: 5000,
      effortMinutes: 1200,
      spendCents: 0,
      founderMinutes: 60,
    },
    guardrails: [
      'flow_error_rate <= 0.02',
      'surface_p95_latency_ms <= 800',
      'complaint_or_optout_rate <= 0.001',
      'entitlement_integrity >= 1',
    ],
    reversible: true,
    stopRule: 'Rollback challenger on any guardrail breach.',
    continueRule: 'Retain incumbent on |effect| < 5pp.',
    scaleRule: 'Promote challenger on ITT effect >=5pp with CI>0.',
    assessment: {
      customerValue: 'positive',
      usability: 'positive',
      feasibility: 'positive',
      businessViability: 'unknown',
    },
    unknowns: ['paid conversion and 30d retention effects'],
    retrospective: false,
    decidedAt: '2026-09-19T12:00:00Z',
    decidedBy: 'founder-tim',
    approvalValidUntil: '2026-12-31T00:00:00Z',
    ...over,
  };
}

const arm = (assigned: number, conversions: number) => ({
  assigned,
  exposed: Math.round(assigned * 0.9),
  conversions,
  ittRate: assigned > 0 ? conversions / assigned : 0,
  exposedOnlyRate: assigned > 0 ? conversions / Math.round(assigned * 0.9) : 0,
});

function writeback(over: Partial<ActivationPilotWriteback> = {}) {
  return activationPilotWritebackSchema.parse({
    contract: 'jovie.activation-decision-writeback/v1',
    experimentId: 'activation-first-value-pilot',
    decision: 'promote',
    reason: 'positive: ITT effect meets the frozen minimum meaningful effect',
    policyVersion: 'activation-pilot/v1',
    specDigest: 'fnv1a64:abc123',
    evidence: {
      arms: {
        incumbent: arm(400, 120),
        challenger: arm(400, 168),
        holdout: arm(89, 27),
      },
      ittEffect: 0.12,
      ittConfidence95: [0.06, 0.18],
      srmChi2: 1.2,
      guardrails: [
        { id: 'error_rate', breached: false, observed: 0.005 },
        { id: 'latency', breached: false, observed: 400 },
        { id: 'complaint', breached: false, observed: 0 },
        { id: 'entitlement', breached: false, observed: 1 },
      ],
    },
    decidedAtIso: '2026-10-05T00:00:00Z',
    ...over,
  });
}

const decide = (over: Partial<BetDecision> = {}): BetDecision => ({
  schema: 'jovie.summer.product-bet-decision/v1',
  betId: 'bet-jov-6468-activation',
  decision: 'continue',
  rationale: 'Outcome consumed per the declared rules.',
  decidedAt: '2026-10-05T12:00:00Z',
  decidedBy: 'founder-tim',
  evidenceClass: 'live',
  ...over,
});

const eventsFor = (wb: ActivationPilotWriteback) =>
  eventsFromActivationWriteback(wb, {
    betId: 'bet-jov-6468-activation',
    runtimeProofRef: 'deploy:vercel/jovie/sha-live-pilot',
    telemetryRef: 'linear:JOV-6468/telemetry-gap',
    businessMetric: 'activated-72h-itt-effect',
  });

describe('eventsFromActivationWriteback', () => {
  it('emits delivered, per-arm measurements, business outcome and guardrails', () => {
    const events = eventsFor(writeback());
    expect(events.map(e => e.kind)).toEqual([
      'delivered',
      'cohort-measurement',
      'cohort-measurement',
      'cohort-measurement',
      'business-outcome',
    ]);
    const projection = projectProductBet(contract(), events);
    expect(projection.delivered?.runtimeProofRef).toBe(
      'deploy:vercel/jovie/sha-live-pilot'
    );
    expect(projection.observedCohortSize).toBe(889);
    expect(projection.businessOutcomeObserved).toBe(true);
    expect(projection.evaluation).toBe('supported');
  });

  it('routes missing-telemetry writebacks to unmeasurable, not failure', () => {
    const wb = writeback({
      decision: 'inconclusive',
      reason: 'missing-telemetry: no exposure logged',
      evidence: {
        arms: {
          incumbent: arm(0, 0),
          challenger: arm(0, 0),
          holdout: arm(0, 0),
        },
        ittEffect: null,
        ittConfidence95: null,
        srmChi2: null,
        guardrails: [],
      },
    });
    const events = eventsFor(wb);
    expect(events.map(e => e.kind)).toEqual(['delivered', 'telemetry-failure']);
    const p = projectProductBet(contract(), events);
    expect(p.evaluation).toBe('unmeasurable-instrumentation-failed');
    expect(p.route).toBe('repair');
  });

  it('keeps a pending-maturity writeback explicitly pending', () => {
    const wb = writeback({
      decision: 'hold',
      reason: 'pending-maturity: observation window has not matured',
      decidedAtIso: '2026-09-25T00:00:00Z',
    });
    const p = projectProductBet(contract(), eventsFor(wb));
    expect(p.evaluation).toBe('awaiting-maturity');
    expect(p.reconsiderationTrigger).toMatch(/^horizon:/u);
  });

  it('projects a guardrail breach to contradicted + repair', () => {
    const wb = writeback({
      decision: 'rollback',
      reason: 'guardrail-breach:error_rate',
      evidence: {
        ...writeback().evidence,
        guardrails: [
          { id: 'error_rate', breached: true, observed: 0.05 },
          { id: 'latency', breached: false, observed: 400 },
        ],
      },
    });
    const p = projectProductBet(contract(), eventsFor(wb));
    expect(p.evaluation).toBe('contradicted');
    expect(p.route).toBe('repair');
    expect(p.destructiveActionAuthorized).toBe(false);
  });
});

describe('recordBetDecision', () => {
  it('accepts a scale decision on a live supported outcome', () => {
    const result = recordBetDecision(
      contract(),
      eventsFor(writeback()),
      decide({
        decision: 'scale',
        rationale: 'Promote challenger per scaleRule.',
      })
    );
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.receipt.outcomeState).toBe('terminal');
      expect(result.receipt.liveBusinessValidation).toBe(true);
      expect(result.receipt.destructiveActionAuthorized).toBe(false);
    }
  });

  it('accepts gather-evidence on an explicitly pending outcome', () => {
    const wb = writeback({
      decision: 'hold',
      reason: 'pending-maturity: observation window has not matured',
      decidedAtIso: '2026-09-25T00:00:00Z',
    });
    const result = recordBetDecision(
      contract(),
      eventsFor(wb),
      decide({ decision: 'gather-evidence' })
    );
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.receipt.outcomeState).toBe('pending');
  });

  it('refuses a scale decision on fixture evidence', () => {
    const result = recordBetDecision(
      contract(),
      eventsFor(writeback()),
      decide({ decision: 'scale', evidenceClass: 'fixture' })
    );
    expect(result).toMatchObject({
      accepted: false,
      reasons: ['scale-requires-live-evidence'],
    });
  });

  it('refuses decisions inconsistent with the evaluation', () => {
    const wb = writeback({
      decision: 'retain',
      reason: 'no-meaningful-effect: incumbent retained',
      evidence: {
        ...writeback().evidence,
        arms: {
          incumbent: arm(400, 120),
          challenger: arm(400, 124),
          holdout: arm(89, 27),
        },
        ittEffect: 0.01,
      },
    });
    const result = recordBetDecision(
      contract(),
      eventsFor(wb),
      decide({ decision: 'scale' })
    );
    expect(result.accepted).toBe(false);
  });

  it('refuses decisions on a stale approval', () => {
    const result = recordBetDecision(
      contract({ approvalValidUntil: '2026-10-01T00:00:00Z' }),
      eventsFor(writeback()),
      decide()
    );
    expect(result).toMatchObject({
      accepted: false,
      reasons: ['stale-approval'],
    });
  });

  it('stop decisions never authorize destructive action', () => {
    const wb = writeback({
      decision: 'reject',
      reason: 'regressive: ITT confidence interval is entirely negative',
      evidence: {
        ...writeback().evidence,
        arms: {
          incumbent: arm(400, 160),
          challenger: arm(400, 80),
          holdout: arm(89, 36),
        },
        ittEffect: -0.2,
        ittConfidence95: [-0.26, -0.14],
      },
    });
    const projection = projectProductBet(contract(), eventsFor(wb));
    expect(projection.evaluation).toBe('contradicted');
    const result = recordBetDecision(
      contract(),
      eventsFor(wb),
      decide({
        decision: 'stop',
        rationale: 'Challenger regresses activation.',
      })
    );
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.receipt.destructiveActionAuthorized).toBe(false);
      expect(result.receipt.liveBusinessValidation).toBe(true);
    }
  });
});

describe('betDecisionCardView', () => {
  it('renders the Ovie decision card fields from the projection', () => {
    const projection = projectProductBet(contract(), eventsFor(writeback()));
    const card = betDecisionCardView(contract(), projection);
    expect(card).toMatchObject({
      kind: 'decision',
      betId: 'bet-jov-6468-activation',
      recommendation: 'continue',
      strongestEvidence: 'Claimed profiles stall before first value.',
      bestAlternative: 'Retain the current claim → activate flow.',
      prediction: {
        metric: 'activated-72h-itt-effect',
        expectedValue: 0.05,
      },
      requiredAuthority: 'founder',
      outcomeState: 'business-outcome',
      evaluation: 'supported',
    });
  });

  it('carries the next reconsideration trigger while pending', () => {
    const wb = writeback({
      decision: 'hold',
      reason: 'pending-maturity: observation window has not matured',
      decidedAtIso: '2026-09-25T00:00:00Z',
    });
    const card = betDecisionCardView(
      contract(),
      projectProductBet(contract(), eventsFor(wb))
    );
    expect(card.outcomeState).toBe('business-outcome');
    expect(card.nextReconsiderationTrigger).toMatch(/^horizon:/u);
  });
});
