/**
 * ACQUISITION_ELIGIBLE (JOV-7696): a derived, fail-closed predicate over the
 * $199 artist revenue cone.
 *
 * It composes receipts that existing owners already produce (the M2
 * revenue-path canary, the auth/signup and public-profile canaries, the
 * Stripe test-mode Golden Path lane, and the dogfood-excluded founder
 * funnel). It holds no state and has no manual toggle: the predicate turns
 * true only when every required receipt is currently green, and turns back
 * to false the moment one goes red, stale, or missing.
 *
 * Consumers (Summer company reads, the lead ramp, the outreach dispatcher)
 * gate deliberate acquisition on it. It never gates inbound users or
 * unrelated product work.
 */

export const ACQUISITION_ELIGIBILITY_CONTRACT =
  'jovie.acquisition-eligibility/v1' as const;

export type ConeEvidenceStatus = 'green' | 'red' | 'unknown';

export type AcquisitionEligibilityVerdict = 'ELIGIBLE' | 'BLOCKED' | 'UNKNOWN';

export interface ConeRequirement {
  readonly id: string;
  readonly label: string;
  readonly owner: string;
  /** What the owner does when this requirement is the first blocker. */
  readonly nextAction: string;
}

/**
 * Ordered along the customer journey: stranger → entry → signup/claim →
 * profile truth → $199 offer/checkout → activation → verified payment and
 * entitlement, plus the instrumentation that measures it. The first
 * non-green requirement in this order is the binding constraint.
 */
export const REVENUE_CONE_REQUIREMENTS = [
  {
    id: 'entry',
    label: 'Homepage entry is reachable and shows the claim handoff',
    owner: 'engineering (M2 revenue-path canary, JOV-6439)',
    nextAction:
      'Repair the signed-out homepage claim entry, then rerun the M2 revenue-path canary.',
  },
  {
    id: 'auth_signup',
    label: 'Signup, sign-in and onboarding entrypoints are healthy',
    owner: 'engineering (auth/signup canary, JOV-1871)',
    nextAction:
      'Repair the failing auth or onboarding surface, then rerun the auth-signup-onboarding canary.',
  },
  {
    id: 'claim',
    label: 'Claim and $199 Pro signup surfaces are truthful',
    owner: 'engineering (M2 revenue-path canary, JOV-6439)',
    nextAction:
      'Repair the pricing or Pro signup surface, then rerun the M2 revenue-path canary.',
  },
  {
    id: 'profile_truth',
    label: 'Canonical artist profile data is truthful',
    owner:
      'engineering (public-profile canary + canonical profile certificate, JOV-6920)',
    nextAction:
      'Repair the failing profile check, then rerun the public-profile canary and M2 workflow.',
  },
  {
    id: 'offer_checkout',
    label: 'The $199 Pro offer is current and checkout is gated correctly',
    owner: 'billing (M2 revenue-path canary, JOV-6439)',
    nextAction:
      'Repair the $199 price option or checkout gate, then rerun the M2 revenue-path canary.',
  },
  {
    id: 'activation',
    label: 'Post-checkout activation surface is healthy',
    owner: 'billing (M2 revenue-path canary, JOV-6439)',
    nextAction:
      'Repair /billing/success or the checkout-session read, then rerun the M2 revenue-path canary.',
  },
  {
    id: 'payment_entitlement',
    label:
      'Verified payment, entitlement and refund pass end to end (Stripe test-mode Golden Path)',
    owner: 'billing (Golden Path lane, JOV-7192)',
    nextAction:
      'Fix the Golden Path lane failure tracked on JOV-7192, then rerun Golden Path Nightly.',
  },
  {
    id: 'instrumentation',
    label:
      'Founder funnel is measurable with dogfood and test accounts excluded',
    owner: 'data (founder funnel, JOV-7484 / JOV-7362)',
    nextAction:
      'Restore the founder funnel read so traffic and conversion can be diagnosed.',
  },
] as const satisfies readonly ConeRequirement[];

export type ConeRequirementId =
  (typeof REVENUE_CONE_REQUIREMENTS)[number]['id'];

/** One receipt from an existing evidence owner. */
export interface ConeEvidence {
  readonly requirement: ConeRequirementId;
  /** Stable source id, e.g. `m2-revenue-path:live#claim`. */
  readonly source: string;
  readonly status: ConeEvidenceStatus;
  /** When the evidence was produced; null means the source never reported. */
  readonly observedAt: string | null;
  /** Longest age at which a green receipt still counts as current. */
  readonly maxAgeMs: number;
  readonly ref: string | null;
  readonly detail: string;
}

export interface EvaluatedConeEvidence extends ConeEvidence {
  /** Status after freshness: a stale or undated green reads as unknown. */
  readonly effectiveStatus: ConeEvidenceStatus;
}

export interface ConeRequirementResult {
  readonly id: ConeRequirementId;
  readonly label: string;
  readonly status: ConeEvidenceStatus;
  readonly owner: string;
  readonly nextAction: string;
  readonly explanation: string;
  readonly evidence: readonly EvaluatedConeEvidence[];
}

export interface AcquisitionEligibility {
  readonly contract: typeof ACQUISITION_ELIGIBILITY_CONTRACT;
  readonly cone: '$199-artist-pro';
  readonly evaluatedAt: string;
  /** True only when every requirement is currently green. */
  readonly eligible: boolean;
  readonly verdict: AcquisitionEligibilityVerdict;
  readonly requirements: readonly ConeRequirementResult[];
  /** Non-green requirements in journey order. */
  readonly blockers: readonly ConeRequirementResult[];
  /** The binding constraint to work instead of buying more traffic. */
  readonly firstBlocker: ConeRequirementResult | null;
  /** What a growth/revenue planner must do with this result. */
  readonly policy: {
    readonly outboundAcquisition: 'allowed' | 'blocked';
    readonly inbound: 'serve';
    readonly instruction: string;
  };
}

function effectiveStatus(
  evidence: ConeEvidence,
  nowMs: number
): ConeEvidenceStatus {
  if (evidence.status !== 'green') return evidence.status;
  if (!evidence.observedAt) return 'unknown';
  const observedMs = Date.parse(evidence.observedAt);
  if (!Number.isFinite(observedMs)) return 'unknown';
  // A receipt dated in the future cannot be trusted as current.
  if (observedMs > nowMs + 5 * 60_000) return 'unknown';
  return nowMs - observedMs <= evidence.maxAgeMs ? 'green' : 'unknown';
}

function worst(statuses: readonly ConeEvidenceStatus[]): ConeEvidenceStatus {
  if (statuses.length === 0) return 'unknown';
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('unknown')) return 'unknown';
  return 'green';
}

function explain(
  status: ConeEvidenceStatus,
  evidence: readonly EvaluatedConeEvidence[]
): string {
  if (evidence.length === 0) return 'No evidence source reported a receipt.';
  if (status === 'green') return 'All receipts are green and current.';
  const failing = evidence.filter(item => item.effectiveStatus !== 'green');
  return failing
    .map(item => {
      const stale =
        item.status === 'green' && item.effectiveStatus === 'unknown'
          ? ' (green but stale or undated)'
          : '';
      return `${item.source}: ${item.effectiveStatus}${stale} - ${item.detail}`;
    })
    .join('; ');
}

function policyInstruction(firstBlocker: ConeRequirementResult | null) {
  if (!firstBlocker) {
    return 'The $199 cone is green: outbound acquisition may be recommended, sized from current funnel conversion.';
  }
  return `Do not recommend outbound acquisition or more traffic. Work the first blocking receipt instead: ${firstBlocker.label} (${firstBlocker.status}). Owner: ${firstBlocker.owner}. Next: ${firstBlocker.nextAction}`;
}

export function evaluateAcquisitionEligibility(input: {
  readonly evidence: readonly ConeEvidence[];
  readonly now: Date;
}): AcquisitionEligibility {
  const nowMs = input.now.getTime();
  const requirements: ConeRequirementResult[] = REVENUE_CONE_REQUIREMENTS.map(
    requirement => {
      const evidence = input.evidence
        .filter(item => item.requirement === requirement.id)
        .map(item => ({
          ...item,
          effectiveStatus: effectiveStatus(item, nowMs),
        }));
      const status = worst(evidence.map(item => item.effectiveStatus));
      return {
        evidence,
        explanation: explain(status, evidence),
        id: requirement.id,
        label: requirement.label,
        nextAction: requirement.nextAction,
        owner: requirement.owner,
        status,
      };
    }
  );

  const blockers = requirements.filter(item => item.status !== 'green');
  const firstBlocker = blockers[0] ?? null;
  const eligible = blockers.length === 0;
  let verdict: AcquisitionEligibilityVerdict = 'ELIGIBLE';
  if (blockers.some(item => item.status === 'red')) verdict = 'BLOCKED';
  else if (!eligible) verdict = 'UNKNOWN';

  return {
    blockers,
    cone: '$199-artist-pro',
    contract: ACQUISITION_ELIGIBILITY_CONTRACT,
    eligible,
    evaluatedAt: input.now.toISOString(),
    firstBlocker,
    policy: {
      inbound: 'serve',
      instruction: policyInstruction(firstBlocker),
      outboundAcquisition: eligible ? 'allowed' : 'blocked',
    },
    requirements,
    verdict,
  };
}

/** Fail-closed result for when the evidence could not be composed at all. */
export function unknownAcquisitionEligibility(
  now: Date,
  reason: string
): AcquisitionEligibility {
  return evaluateAcquisitionEligibility({
    evidence: REVENUE_CONE_REQUIREMENTS.map(requirement => ({
      detail: reason,
      maxAgeMs: 0,
      observedAt: null,
      ref: null,
      requirement: requirement.id,
      source: 'acquisition-eligibility:composer',
      status: 'unknown' as const,
    })),
    now,
  });
}

/** One-line reason for logs, ramp reasons and dispatcher skips. */
export function describeAcquisitionBlock(
  eligibility: Pick<AcquisitionEligibility, 'verdict' | 'firstBlocker'>
): string {
  const blocker = eligibility.firstBlocker;
  if (!blocker) return 'ACQUISITION_ELIGIBLE: the $199 cone is green.';
  return `ACQUISITION_ELIGIBLE is false (${eligibility.verdict}): first blocker ${blocker.id} is ${blocker.status}. ${blocker.nextAction}`;
}
