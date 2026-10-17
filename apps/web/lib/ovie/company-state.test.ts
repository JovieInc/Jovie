import { describe, expect, it } from 'vitest';
import { projectCommerceDecisions } from '@/lib/acquisition/commerce-decision';
import {
  type ConeEvidenceStatus,
  type ConeRequirementId,
  evaluateAcquisitionEligibility,
  REVENUE_CONE_REQUIREMENTS,
} from '@/lib/acquisition/eligibility';
import type { AcquisitionEligibilityReport } from '@/lib/acquisition/eligibility.server';
import type { FounderFunnelData } from '@/lib/admin/founder-funnel';
import type { SummerFunnelResponse } from '@/lib/analytics/signup-funnel.server';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import type { ShippingStateProjection } from '@/lib/ovie/shipping-state';
import {
  buildCompanyState,
  effectiveCompanyMetricStatus,
  interpretCompanyState,
} from './company-state';

const NOW = new Date('2026-10-14T08:00:00.000Z');
const FRESH = '2026-10-14T07:55:00.000Z';
const STALE = '2026-10-13T07:55:00.000Z';

function eligibility(
  statuses: Partial<Record<ConeRequirementId, ConeEvidenceStatus>> = {},
  observed: Partial<Record<ConeRequirementId, string>> = {},
  maxAgeMs = 30 * 60_000
): AcquisitionEligibilityReport {
  const evaluated = evaluateAcquisitionEligibility({
    now: NOW,
    evidence: REVENUE_CONE_REQUIREMENTS.map(requirement => ({
      requirement: requirement.id,
      source: `canary:${requirement.id}`,
      status: statuses[requirement.id] ?? 'green',
      observedAt: observed[requirement.id] ?? FRESH,
      maxAgeMs,
      ref: `receipt:${requirement.id}`,
      detail: 'fixture receipt',
    })),
  });
  const receipt = {
    status: 'green' as const,
    observedAt: FRESH,
    maxAgeMs,
  };
  return {
    ...evaluated,
    funnel: null,
    commerce: projectCommerceDecisions(
      {
        matrixRevision: 'matrix-r7',
        decisions: [
          {
            offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
            channel: 'agent-handoff',
            rail: 'ordinary-web-checkout',
            accessState: 'supported',
            merchantOfRecord: 'jovie',
            evidence: {
              selectedRail: receipt,
              jov6258Preflight: receipt,
              handoffCorrelation: receipt,
              paymentJourney: receipt,
              reversal: receipt,
            },
            decisionRevision: 'decision-r4',
            canary: {
              result: 'passed',
              observedAt: FRESH,
              maxAgeMs,
            },
            nextReevaluationTrigger: 'policy-access-price-or-geography-change',
          },
        ],
      },
      NOW
    ),
  };
}

function funnel(counts: Record<string, number>): SummerFunnelResponse {
  return {
    contractVersion: 'summer-funnel/v2',
    observedAt: FRESH,
    windows: {
      '7d': {
        funnels: [
          {
            funnelId: 'artist_signup',
            steps: Object.entries(counts).map(([step, count]) => ({
              step,
              count,
            })),
          },
        ],
      },
    },
  } as unknown as SummerFunnelResponse;
}

function founder(): FounderFunnelData {
  return {
    errors: [],
    stages: [
      ['accounts_created', 20],
      ['onboarding_complete', 4],
      ['paid', 5],
    ].map(([key, count]) => ({ key, count })),
  } as unknown as FounderFunnelData;
}

function shipping(): ShippingStateProjection {
  const count = (value: number) => ({ value });
  return {
    state: 'fresh',
    sourceRevision: 'shipping-revision',
    observationTimestamp: FRESH,
    cursor: 'cursor',
    sources: { delivery: true },
    operationalTasks: { tasks: [] },
    delivery: {
      merges: {
        since: '2026-10-14T07:00:00.000Z',
        today: count(3),
        last7Days: count(21),
        prior7Days: count(14),
      },
      mergeQueueDepth: count(2),
    },
  } as unknown as ShippingStateProjection;
}

function build(input: {
  eligibility?: AcquisitionEligibilityReport;
  funnel?: SummerFunnelResponse;
  previous?: ReturnType<typeof buildCompanyState>;
  shipping?: ShippingStateProjection;
  linearIssues?: readonly {
    identifier: string;
    priority: number;
    state: { name: string; type: string };
    updatedAt: string;
  }[];
}) {
  return buildCompanyState({
    now: NOW,
    revision: 'revision',
    acquisitionEligibility: input.eligibility ?? eligibility(),
    signupFunnel:
      input.funnel ??
      funnel({ landing_view: 100, cta_click: 50, onboarding_started: 25 }),
    founderFunnel: founder(),
    waitlist: {
      total: 10,
      waitlisted: 4,
      invited: 2,
      signedUp: 4,
      emailFailures: 0,
    },
    previous: input.previous,
    shippingProjection: input.shipping,
    linearIssues: input.linearIssues,
    linearObservedAt: input.linearIssues ? FRESH : null,
  });
}

describe('Summer company state', () => {
  it('turns a stale canary into deduplicated recovery work', () => {
    const report = eligibility({}, { profile_truth: STALE });
    const first = build({ eligibility: report });
    expect(first.activeConstraint).toBe('certification:public_profile');
    expect(first.investigations[0]).toMatchObject({
      cause: 'stale_evidence',
      attempts: 1,
      founderEscalation: false,
      owner: 'acquisition-eligibility',
      state: 'recovering',
    });
    const repeated = build({ eligibility: report, previous: first });
    expect(repeated.investigations[0]?.attempts).toBe(1);
    const daily = build({
      eligibility: eligibility(
        {},
        { profile_truth: '2026-10-14T06:00:00.000Z' },
        30 * 60 * 60_000
      ),
    });
    expect(
      effectiveCompanyMetricStatus(daily.certification.public_profile, NOW)
    ).toBe('green');
    expect(daily.activeConstraint).not.toBe('certification:public_profile');
  });

  it('selects traffic with zero onboarding as a product investigation', () => {
    const snapshot = build({
      funnel: funnel({
        landing_view: 100,
        cta_click: 50,
        onboarding_started: 0,
      }),
    });
    expect(snapshot.activeConstraint).toBe('funnel:onboarding_starts');
    expect(snapshot.investigations[0]).toMatchObject({
      id: 'funnel:onboarding_starts',
      cause: 'product_failure',
      founderEscalation: false,
    });
    const claim = build({
      funnel: funnel({
        landing_view: 80,
        cta_click: 20,
        onboarding_started: 10,
        claim_complete: 0,
      }),
    });
    expect(claim.activeConstraint).toBe('funnel:claim_completed');
    expect(claim.investigations[0]?.cause).toBe('product_failure');
  });

  it('advances left-to-right when a revenue-cone step becomes green', () => {
    const entryRed = build({ eligibility: eligibility({ entry: 'red' }) });
    expect(entryRed.activeConstraint).toBe('certification:homepage_entry');
    expect(entryRed.investigations[0]?.cause).toBe('product_failure');

    const authRed = build({
      eligibility: eligibility({ auth_signup: 'red' }),
    });
    expect(authRed.activeConstraint).toBe(
      'certification:onboarding_auth_claim'
    );

    const commerceUnknown = build({
      eligibility: eligibility({ selected_rail: 'unknown' }),
    });
    expect(
      commerceUnknown.certification.checkout_payment_entitlement.status
    ).toBe('unknown');
    expect(commerceUnknown.activeConstraint).toBe(
      'certification:checkout_payment_entitlement'
    );
  });

  it('commissions shipping and acquisition producers', () => {
    const snapshot = build({
      shipping: shipping(),
      linearIssues: [
        {
          identifier: 'JOV-7880',
          priority: 1,
          state: { name: 'Blocked', type: 'started' },
          updatedAt: FRESH,
        },
      ],
    });
    expect(snapshot.shipping.rollingRatePerDay).toMatchObject({
      value: 3,
      semantics: 'exact',
      source: 'shipping-state',
    });
    expect(snapshot.shipping.dailyBuckets.value).toEqual([
      { day: '2026-10-14', shipped: 3 },
    ]);
    expect(snapshot.linear).toMatchObject({
      activeConstraint: { value: 'JOV-7880', semantics: 'estimated' },
      p0s: { value: 1 },
      blocked: { value: 1 },
      inProgress: { value: 1 },
      admitted: { value: 1 },
      meaningfulDelta: { value: 1 },
    });
    expect(snapshot.producerHealth).toMatchObject({
      acquisitionEligibility: { value: 'alive' },
      pipelineScoreboard: { value: 'alive' },
    });
    expect(snapshot.sync.map(item => [item.provider, item.mode])).toEqual([
      ['github', 'reconcile'],
      ['linear', 'reconcile'],
      ['product', 'reconcile'],
    ]);
    const expired = interpretCompanyState(
      snapshot,
      new Date('2026-10-14T12:00:00.000Z')
    );
    expect(expired.activeConstraint).toBe('certification:public_profile');
    expect(expired.investigations[0]?.cause).toBe('stale_evidence');
  });
});
