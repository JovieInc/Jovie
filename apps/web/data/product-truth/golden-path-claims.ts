import { APP_ROUTES } from '@/constants/routes';
import {
  COMPUTED_PROOF_SLOTS,
  type ComputedProofSlotId,
} from '@/lib/proof/claim-time-proof';
import { isClaimBearing, resolvesToClaim } from './claim-audit';
import { DOGFOOD_RECEIPT_TTL_DAYS } from './dogfood';
import {
  type EvidenceClass,
  isAdmissibleEvidence,
  type ProofGeneratorId,
} from './evidence';
import {
  createProofRequest,
  PROOF_REGISTRY,
  type ProofCandidate,
  type ProofKind,
  type ProofRequest,
  proofEvidenceClass,
  proofFreshnessDate,
  validateProof,
} from './proof';
import type { Claim } from './registry';

/**
 * Golden-path claim inventory and proof gate (JOV-7750, epic JOV-7244).
 *
 * Every persuasive claim a prospect reads between the homepage and the $199
 * upgrade, with the file that renders it and the evidence behind it. The
 * audit classifies each claim and fails what a buyer could not verify:
 *
 * - outcome: "Jovie gets results". Needs computed, dogfood or pilot
 *   evidence (`evidence.ts`). No evidence becomes a ProofRequest that names
 *   its generator.
 * - capability: "Jovie does X". Every capability it leans on must be
 *   certified (`scripts/lanes/certified-capabilities.gen.json`).
 * - offer: price and plan terms. Must quote `lib/billing/offer-truth.ts`.
 * - positioning: no checkable assertion, so it may carry no number.
 *
 * A digit in any non-offer claim without admissible evidence is an invented
 * number and fails outright. The report is written to
 * `golden-path-proof.gen.json`, which the funnel judge reads.
 */

export const GOLDEN_PATH_STEPS = [
  'homepage',
  'claim',
  'start',
  'preview',
  'signup',
  'upgrade',
  'pricing',
] as const;

export type GoldenPathStep = (typeof GOLDEN_PATH_STEPS)[number];

/** Funnel-judge step ids (scripts/funnel-judge/steps.mjs) per golden-path step. */
export const FUNNEL_JUDGE_STEP_IDS: Readonly<
  Record<GoldenPathStep, readonly string[]>
> = {
  homepage: [],
  claim: ['outreach', 'claim-landing'],
  start: ['start', 'qualify-chat'],
  preview: ['profile-reveal'],
  signup: ['claim-decision'],
  upgrade: ['upgrade'],
  pricing: [],
};

/** Steps where a buyer is asked to pay; each needs admissible outcome proof. */
export const PAYWALL_STEPS: readonly GoldenPathStep[] = ['upgrade', 'pricing'];

export type ClaimNature = 'outcome' | 'capability' | 'offer' | 'positioning';

export type ClaimEvidence =
  | { readonly class: 'computed'; readonly slot: ComputedProofSlotId }
  | {
      readonly class: 'dogfood' | 'pilot';
      readonly proofIds: readonly string[];
    }
  | {
      readonly class: 'none';
      readonly kind: ProofKind;
      readonly generator: ProofGeneratorId;
      readonly need: string;
    };

export interface GoldenPathClaim {
  readonly id: string;
  readonly step: GoldenPathStep;
  readonly route: string;
  /** Repo path whose source contains `copy` verbatim. */
  readonly source: string;
  /** The rendered copy, exactly as the source holds it. */
  readonly copy: string;
  readonly nature: ClaimNature;
  readonly capabilityIds: readonly string[];
  /** Required for outcome claims. */
  readonly evidence?: ClaimEvidence;
}

const HOMEPAGE_COPY = 'apps/web/data/homepageIdentityCopy.ts';
const PRESENCE_STEPS = 'apps/web/lib/onboarding/presence-build/execute-step.ts';

export const GOLDEN_PATH_CLAIMS: readonly GoldenPathClaim[] = [
  {
    id: 'homepage.hero.headline',
    step: 'homepage',
    route: '/',
    source: HOMEPAGE_COPY,
    copy: 'Be found. Be understood.',
    nature: 'outcome',
    capabilityIds: ['public-profile', 'agent-readable-profile-summary'],
    evidence: {
      class: 'dogfood',
      proofIds: ['dogfood-tim-human-link-clicks-90d'],
    },
  },
  {
    id: 'homepage.hero.subhead',
    step: 'homepage',
    route: '/',
    source: HOMEPAGE_COPY,
    copy: 'Claim your name. Jovie makes you easy to reach, for people and for agents.',
    nature: 'outcome',
    capabilityIds: ['public-profile', 'agent-readable-profile-summary'],
    evidence: { class: 'dogfood', proofIds: ['dogfood-tim-known-contacts'] },
  },
  {
    id: 'homepage.hero.claimed-preview',
    step: 'homepage',
    route: '/',
    source: HOMEPAGE_COPY,
    copy: 'Tim White’s Jovie profile at jov.ie/tim',
    nature: 'outcome',
    capabilityIds: ['public-profile'],
    evidence: {
      class: 'dogfood',
      proofIds: ['product-profile-subscribe-capture'],
    },
  },
  {
    id: 'homepage.presence.headline',
    step: 'homepage',
    route: '/',
    source: HOMEPAGE_COPY,
    copy: 'Your presence, resolved.',
    nature: 'outcome',
    capabilityIds: ['public-profile'],
    evidence: { class: 'computed', slot: 'presence-signals' },
  },
  {
    id: 'homepage.presence.next-step',
    step: 'homepage',
    route: '/',
    source: HOMEPAGE_COPY,
    copy: 'Read the work. Start a conversation. Attend an event or send a payment.',
    nature: 'capability',
    capabilityIds: ['artist-profiles', 'public-ask', 'pay'],
  },
  {
    id: 'homepage.structure.body',
    step: 'homepage',
    route: '/',
    source: HOMEPAGE_COPY,
    copy: 'One identity. Room for everything you do, and whatever comes next.',
    nature: 'positioning',
    capabilityIds: [],
  },
  {
    id: 'claim.banner.ready',
    step: 'claim',
    route: '/[handle]?claim=1',
    source: 'apps/web/components/features/profile/ClaimBanner.tsx',
    copy: 'Your profile is ready. Claim it to turn on release emails.',
    nature: 'capability',
    capabilityIds: ['public-profile', 'artist-notifications'],
  },
  {
    id: 'start.metadata.one-conversation',
    step: 'start',
    route: '/start',
    source: 'apps/web/app/(dynamic)/start/page.tsx',
    copy: 'Start your artist profile in one conversation.',
    nature: 'outcome',
    capabilityIds: ['artist-profiles'],
    evidence: {
      class: 'none',
      kind: 'metric',
      generator: 'dogfood',
      need: 'Median onboarding turns from first /start message to a live profile, measured from prod chat sessions.',
    },
  },
  {
    id: 'preview.research.verified-signals',
    step: 'preview',
    route: '/start (profile reveal)',
    source: PRESENCE_STEPS,
    copy: 'from your connected sources.',
    nature: 'outcome',
    capabilityIds: ['artist-profiles'],
    evidence: { class: 'computed', slot: 'presence-signals' },
  },
  {
    id: 'preview.work-opportunities.ready',
    step: 'preview',
    route: '/start (profile reveal)',
    source: PRESENCE_STEPS,
    copy: 'Your Work opportunity queue is ready. Findings stay local and nothing was sent.',
    nature: 'outcome',
    capabilityIds: ['artist-profiles'],
    evidence: { class: 'computed', slot: 'work-opportunities' },
  },
  {
    id: 'preview.profile.live',
    step: 'preview',
    route: '/start (profile reveal)',
    source: PRESENCE_STEPS,
    copy: 'Your public page is live at',
    nature: 'outcome',
    capabilityIds: ['public-profile'],
    evidence: { class: 'computed', slot: 'live-profile-url' },
  },
  {
    id: 'signup.offer.free-profile',
    step: 'signup',
    route: '/signup',
    source: 'apps/web/lib/billing/offer-truth.ts',
    copy: 'Your Jovie profile stays free forever. Downgrading restores Jovie branding and keeps audience capture.',
    nature: 'offer',
    capabilityIds: ['public-profile'],
  },
  {
    id: 'upgrade.pro.tagline',
    step: 'upgrade',
    route: APP_ROUTES.SETTINGS_BILLING,
    source: 'apps/web/lib/entitlements/registry.ts',
    copy: 'Continuous visibility monitoring, prioritized opportunities, and agentic fixes.',
    nature: 'capability',
    capabilityIds: ['profile-monitoring'],
  },
  {
    id: 'pricing.pro.note',
    step: 'pricing',
    route: '/pricing',
    source: 'apps/web/lib/billing/offer-truth.ts',
    copy: 'Limited access.',
    nature: 'offer',
    capabilityIds: [],
  },
  {
    id: 'pricing.free.feature',
    step: 'pricing',
    route: '/pricing',
    source: 'apps/web/data/marketingPricingPlans.ts',
    copy: 'Public Jovie profile and audience capture',
    nature: 'capability',
    capabilityIds: ['public-profile', 'artist-profiles'],
  },
];

export const CLAIM_STATUSES = [
  'admissible',
  'proof-gap',
  'uncertified-capability',
  'invented-number',
  'unbacked-offer',
  'checkable-positioning',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface AuditedGoldenPathClaim {
  readonly id: string;
  readonly step: GoldenPathStep;
  readonly route: string;
  readonly source: string;
  readonly copy: string;
  readonly nature: ClaimNature;
  readonly evidenceClass: EvidenceClass | null;
  readonly status: ClaimStatus;
  readonly detail: string;
  readonly request?: ProofRequest;
}

export interface GoldenPathProofReport {
  readonly schema: 'jovie.golden-path-proof/v1';
  readonly asOf: string;
  /** Funnel-judge step ids per golden-path step, for the judge's proof gate. */
  readonly funnelStepIds: typeof FUNNEL_JUDGE_STEP_IDS;
  readonly claims: readonly AuditedGoldenPathClaim[];
  /** Outcome-claim evidence classes, the buyer's "does it work?" answer. */
  readonly evidenceCounts: Readonly<Record<EvidenceClass, number>>;
  readonly statusCounts: Readonly<Record<ClaimStatus, number>>;
  /** Paywall steps that show no admissible outcome proof at all. */
  readonly prooflessPaywallSteps: readonly GoldenPathStep[];
  readonly proofRequests: readonly ProofRequest[];
}

export interface GoldenPathAuditInput {
  readonly asOf: string;
  readonly certifiedCapabilityIds: ReadonlySet<string>;
  readonly offerClaims: readonly Claim[];
  readonly registry?: readonly ProofCandidate[];
  readonly claims?: readonly GoldenPathClaim[];
}

const HAS_DIGIT = /\d/u;

function auditOutcome(
  claim: GoldenPathClaim,
  registry: readonly ProofCandidate[],
  asOf: string
): Pick<AuditedGoldenPathClaim, 'evidenceClass' | 'status' | 'detail'> & {
  readonly request?: { kind: ProofKind; generator: ProofGeneratorId };
} {
  const fresh = (item: ProofCandidate) => {
    const date = proofFreshnessDate(item);
    if (item.kind !== 'metric' || !date) return true;
    return (
      Date.parse(asOf) - Date.parse(date) <=
      DOGFOOD_RECEIPT_TTL_DAYS * 86_400_000
    );
  };
  const evidence = claim.evidence;
  if (!evidence) {
    return {
      evidenceClass: 'none',
      status: 'proof-gap',
      detail: 'outcome claim declares no evidence',
      request: { kind: 'metric', generator: 'computed' },
    };
  }
  if (evidence.class === 'none') {
    return {
      evidenceClass: 'none',
      status: 'proof-gap',
      detail: evidence.need,
      request: { kind: evidence.kind, generator: evidence.generator },
    };
  }
  if (evidence.class === 'computed') {
    return COMPUTED_PROOF_SLOTS[evidence.slot]
      ? {
          evidenceClass: 'computed',
          status: 'admissible',
          detail: `computed slot ${evidence.slot}: ${COMPUTED_PROOF_SLOTS[evidence.slot].proves}`,
        }
      : {
          evidenceClass: 'none',
          status: 'proof-gap',
          detail: `unknown computed slot ${evidence.slot}`,
          request: { kind: 'metric', generator: 'computed' },
        };
  }
  const items = evidence.proofIds.map(proofId =>
    registry.find(candidate => candidate.id === proofId)
  );
  const valid = items.filter(
    (item): item is ProofCandidate =>
      item !== undefined &&
      proofEvidenceClass(item) === evidence.class &&
      validateProof(item, asOf).valid &&
      fresh(item)
  );
  if (valid.length > 0 && valid.length === evidence.proofIds.length) {
    return {
      evidenceClass: evidence.class,
      status: 'admissible',
      detail: `${evidence.class} proof ${evidence.proofIds.join(', ')}`,
    };
  }
  const missing = evidence.proofIds.filter(
    proofId => !valid.some(item => item.id === proofId)
  );
  return {
    evidenceClass: 'none',
    status: 'proof-gap',
    detail: `${evidence.class} proof missing, stale, invalid or not ${evidence.class}: ${missing.join(', ')}`,
    request: {
      kind: 'metric',
      generator: evidence.class === 'pilot' ? 'pilot' : 'dogfood',
    },
  };
}

export function auditGoldenPathClaims(
  input: GoldenPathAuditInput
): GoldenPathProofReport {
  const registry = input.registry ?? PROOF_REGISTRY;
  const inventory = input.claims ?? GOLDEN_PATH_CLAIMS;
  const claims = inventory.map((claim): AuditedGoldenPathClaim => {
    const base = {
      id: claim.id,
      step: claim.step,
      route: claim.route,
      source: claim.source,
      copy: claim.copy,
      nature: claim.nature,
    };
    if (claim.nature === 'offer') {
      const backed = resolvesToClaim(claim.copy, input.offerClaims);
      return {
        ...base,
        evidenceClass: null,
        status: backed ? 'admissible' : 'unbacked-offer',
        detail: backed
          ? 'quotes lib/billing/offer-truth.ts'
          : 'offer copy does not quote lib/billing/offer-truth.ts',
      };
    }
    const uncertified = claim.capabilityIds.filter(
      id => !input.certifiedCapabilityIds.has(id)
    );
    if (claim.nature === 'outcome') {
      const outcome = auditOutcome(claim, registry, input.asOf);
      const request = outcome.request
        ? createProofRequest({
            kind: outcome.request.kind,
            claimId: `golden-path.${claim.id}`,
            pagesBlocked: [claim.route],
            generator: outcome.request.generator,
          })
        : undefined;
      if (outcome.status === 'proof-gap' && HAS_DIGIT.test(claim.copy)) {
        return {
          ...base,
          evidenceClass: 'none',
          status: 'invented-number',
          detail: `number without admissible evidence: ${outcome.detail}`,
          request,
        };
      }
      if (outcome.status === 'admissible' && uncertified.length > 0) {
        return {
          ...base,
          evidenceClass: outcome.evidenceClass,
          status: 'uncertified-capability',
          detail: `uncertified capability: ${uncertified.join(', ')}`,
        };
      }
      return { ...base, ...outcome, ...(request ? { request } : {}) };
    }
    if (HAS_DIGIT.test(claim.copy)) {
      return {
        ...base,
        evidenceClass: 'none',
        status: 'invented-number',
        detail: `${claim.nature} copy carries a number with no evidence`,
      };
    }
    if (claim.nature === 'positioning') {
      const checkable = isClaimBearing(claim.copy);
      return {
        ...base,
        evidenceClass: null,
        status: checkable ? 'checkable-positioning' : 'admissible',
        detail: checkable
          ? 'positioning copy makes a checkable assertion; classify it as outcome'
          : 'no checkable assertion',
      };
    }
    return {
      ...base,
      evidenceClass: null,
      status: uncertified.length > 0 ? 'uncertified-capability' : 'admissible',
      detail:
        uncertified.length > 0
          ? `uncertified capability: ${uncertified.join(', ')}`
          : `certified: ${claim.capabilityIds.join(', ')}`,
    };
  });

  const evidenceCounts = Object.fromEntries(
    (['computed', 'dogfood', 'pilot', 'none'] as const).map(evidenceClass => [
      evidenceClass,
      claims.filter(
        claim =>
          claim.nature === 'outcome' && claim.evidenceClass === evidenceClass
      ).length,
    ])
  ) as Record<EvidenceClass, number>;
  const statusCounts = Object.fromEntries(
    CLAIM_STATUSES.map(status => [
      status,
      claims.filter(claim => claim.status === status).length,
    ])
  ) as Record<ClaimStatus, number>;
  const prooflessPaywallSteps = PAYWALL_STEPS.filter(
    step =>
      !claims.some(
        claim =>
          claim.step === step &&
          claim.nature === 'outcome' &&
          claim.status === 'admissible' &&
          claim.evidenceClass !== null &&
          isAdmissibleEvidence(claim.evidenceClass)
      )
  );
  const proofRequests = [
    ...claims.flatMap(claim => (claim.request ? [claim.request] : [])),
    ...prooflessPaywallSteps.map(step =>
      createProofRequest({
        kind: 'metric',
        claimId: `golden-path.${step}.paid-outcome`,
        pagesBlocked: [
          inventory.find(claim => claim.step === step)?.route ?? step,
        ],
        generator: 'dogfood',
      })
    ),
  ];

  return {
    schema: 'jovie.golden-path-proof/v1',
    asOf: input.asOf,
    funnelStepIds: FUNNEL_JUDGE_STEP_IDS,
    claims,
    evidenceCounts,
    statusCounts,
    prooflessPaywallSteps,
    proofRequests,
  };
}

/** Statuses that fail CI with no baseline: they are never acceptable. */
export const HARD_FAIL_STATUSES: readonly ClaimStatus[] = [
  'invented-number',
  'unbacked-offer',
  'checkable-positioning',
];
