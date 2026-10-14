import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import {
  type CommerceDecisionSource,
  projectCommerceDecisions,
} from './commerce-decision';

const NOW = new Date('2026-10-14T18:00:00.000Z');
const RECENT = '2026-10-14T17:00:00.000Z';
const DAY_MS = 24 * 60 * 60_000;

function source(): CommerceDecisionSource {
  const evidence = () => ({
    status: 'green' as const,
    observedAt: RECENT,
    maxAgeMs: DAY_MS,
  });
  return {
    matrixRevision: 'matrix-r7',
    decisions: [
      {
        offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
        channel: 'agent-handoff',
        rail: 'ordinary-web-checkout',
        accessState: 'supported',
        merchantOfRecord: 'jovie',
        evidence: {
          selectedRail: evidence(),
          jov6258Preflight: evidence(),
          handoffCorrelation: evidence(),
          paymentJourney: evidence(),
          reversal: evidence(),
        },
        decisionRevision: 'decision-r4',
        canary: {
          result: 'not-run',
          observedAt: null,
          maxAgeMs: DAY_MS,
        },
        nextReevaluationTrigger: 'policy-access-price-or-geography-change',
      },
    ],
  };
}

function project(input = source()) {
  return projectCommerceDecisions(input, NOW);
}

describe('commerce decision projection', () => {
  it('exposes a supported rail as ready while the not-run canary stays ineligible', () => {
    const result = project();
    expect(result).toMatchObject({
      matrixRevision: 'matrix-r7',
      eligible: false,
      acquisitionOffer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    });
    expect(result.matrix[0]).toMatchObject({
      offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
      channel: 'agent-handoff',
      rail: 'ordinary-web-checkout',
      accessState: 'supported',
      merchantOfRecord: 'jovie',
      decisionRevision: 'decision-r4',
      status: 'supported',
      canary: { readiness: 'ready', result: 'not-run' },
      nextReevaluationTrigger: 'policy-access-price-or-geography-change',
    });
    expect(result.matrix[0]?.evidence).toEqual([
      expect.objectContaining({
        kind: 'selected-rail',
        observedAt: RECENT,
        status: 'green',
      }),
      expect.objectContaining({ kind: 'jov-6258-preflight' }),
      expect.objectContaining({ kind: 'handoff-correlation' }),
      expect.objectContaining({ kind: 'payment-journey' }),
      expect.objectContaining({ kind: 'reversal' }),
    ]);
  });

  it('keeps partner-gated access blocked even when supplied evidence is green', () => {
    const input = source();
    input.decisions[0].accessState = 'partner-gated';
    const decision = project(input).matrix[0];
    expect(decision).toMatchObject({
      status: 'partner-gated',
      eligible: false,
      canary: { readiness: 'blocked' },
    });
    expect(decision?.blockers).toContain('access_partner_gated');
  });

  it('turns stale evidence into an explicit stale blocker', () => {
    const input = source();
    input.decisions[0].evidence.paymentJourney.observedAt =
      '2026-10-12T17:00:00.000Z';
    const decision = project(input).matrix[0];
    expect(decision).toMatchObject({ status: 'stale', eligible: false });
    expect(decision?.blockers).toContain('payment_journey_stale');
    expect(
      decision?.evidence.find(item => item.kind === 'payment-journey')
    ).toMatchObject({ status: 'unknown' });
  });

  it('reports a failed canary without weakening its prerequisite readiness', () => {
    const input = source();
    input.decisions[0].canary = {
      result: 'failed',
      observedAt: RECENT,
      maxAgeMs: DAY_MS,
    };
    expect(project(input).matrix[0]).toMatchObject({
      status: 'failed-canary',
      eligible: false,
      canary: { readiness: 'ready', result: 'failed' },
      blockers: ['canary_failed'],
    });
  });

  it('marks only a current passed canary eligible', () => {
    const input = source();
    input.decisions[0].canary = {
      result: 'passed',
      observedAt: RECENT,
      maxAgeMs: DAY_MS,
    };
    const result = project(input);
    expect(result.eligible).toBe(true);
    expect(result.matrix[0]).toMatchObject({
      status: 'passed-canary',
      eligible: true,
      blockers: [],
      canary: { readiness: 'ready', result: 'passed' },
    });
  });

  it.each([
    ['selectedRail', 'selected_rail_missing'],
    ['jov6258Preflight', 'jov_6258_preflight_missing'],
    ['handoffCorrelation', 'handoff_correlation_missing'],
    ['paymentJourney', 'payment_journey_missing'],
    ['reversal', 'reversal_missing'],
  ] as const)('fails closed when %s evidence is missing', (key, blocker) => {
    const input = source();
    input.decisions[0].evidence[key] = {
      status: 'unknown',
      observedAt: null,
      maxAgeMs: DAY_MS,
    };
    input.decisions[0].canary = {
      result: 'passed',
      observedAt: RECENT,
      maxAgeMs: DAY_MS,
    };
    const decision = project(input).matrix[0];
    expect(decision?.eligible).toBe(false);
    expect(decision?.blockers).toContain(blocker);
  });

  it('drops credentials, payment details, PII and reusable identifiers', () => {
    const input = source() as unknown as Record<string, unknown>;
    input.providerCredential = 'provider-credential-value';
    const decision = (input.decisions as Array<Record<string, unknown>>)[0];
    decision.customerEmail = 'customer@example.com';
    decision.paymentIntentId = 'pi_reusable';
    decision.cardNumber = '4242424242424242';
    decision.canary = {
      ...(decision.canary as Record<string, unknown>),
      checkoutSessionId: 'cs_reusable',
    };
    const serialized = JSON.stringify(projectCommerceDecisions(input, NOW));
    for (const secret of [
      'provider-credential-value',
      'customer@example.com',
      'pi_reusable',
      '4242424242424242',
      'cs_reusable',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    const poisoned = source();
    poisoned.decisions[0].decisionRevision = 'pi_known_field_reusable';
    const rejected = JSON.stringify(projectCommerceDecisions(poisoned, NOW));
    expect(rejected).not.toContain('pi_known_field_reusable');
    expect(rejected).toContain('"matrixRevision":"unavailable"');
  });
});
