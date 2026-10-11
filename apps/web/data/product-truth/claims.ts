import {
  formatPublicPriceDisplay,
  getPublicPriceClaims,
} from '@/lib/billing/offer-truth';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { type DogfoodReceiptsFile, dogfoodClaims } from './dogfood';
import dogfoodReceipts from './dogfood-receipts.gen.json';
import {
  type CapabilityDefinition,
  type Claim,
  PRODUCT_CAPABILITIES,
  type ProductCapabilityId,
} from './registry';

/**
 * Claim derivation for the product-truth registry (JOV-7247).
 *
 * Offer and plan claims are read from their owning modules, never retyped:
 * - offers: `lib/billing/offer-truth.ts` public price claims
 * - plan features: `lib/entitlements/registry.ts` marketing feature lists
 * - capability jobs + access labels: `PRODUCT_CAPABILITIES` marketing blocks
 *
 * Metric and comparison claims about the world are the only hand-authored
 * claims, and each must carry measured or externally cited evidence.
 */

/** Public acquisition plans whose entitlement feature lists are published. */
export const PUBLISHED_ENTITLEMENT_PLANS = ['free', 'pro'] as const;

/**
 * Plan-feature classifier. Ordered; the first matching rule wins. A feature
 * string that matches no rule throws, so a new pricing line cannot ship
 * without a capability behind it.
 */
const PLAN_FEATURE_RULES: ReadonlyArray<
  readonly [RegExp, ProductCapabilityId]
> = [
  [/\bmerch\b/iu, 'instant-merch'],
  [/ad pixel/iu, 'ad-pixels'],
  [/verified/iu, 'verified-badge'],
  [/priority support/iu, 'priority-support'],
  [/pitch|ai assistant|chat file|ai-powered/iu, 'ai-assistant'],
  [/contact page|about page|bio|tour dates/iu, 'artist-profiles'],
  [/contacts?\b|fan crm/iu, 'fan-crm'],
  [/tips|payments|earnings/iu, 'pay'],
  [/fan sends|subscribe/iu, 'artist-notifications'],
  [/manual release|pre-release|countdown/iu, 'release-launch'],
  [
    /smart (?:deep )?links?|short link|dsp|auto-sync|url encryption|pre-save/iu,
    'smart-links',
  ],
  [/vanity|public jovie profile/iu, 'public-profile'],
  [/analytics|tracking|audience intelligence|traffic quality/iu, 'analytics'],
];

/** Inheritance markers such as "All Free features +" carry no claim. */
const PLAN_FEATURE_META = /^All \w+ features \+$/u;

export function classifyPlanFeature(feature: string): ProductCapabilityId {
  for (const [pattern, capabilityId] of PLAN_FEATURE_RULES) {
    if (pattern.test(feature)) return capabilityId;
  }
  throw new Error(
    `Unclassified plan feature "${feature}": add a capability rule in data/product-truth/claims.ts`
  );
}

export function slugifyClaimSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function deriveOfferClaims(): Claim[] {
  return getPublicPriceClaims().flatMap(offer => [
    {
      id: `offer.${offer.plan}.price`,
      capabilityId: 'public-profile',
      statement: formatPublicPriceDisplay(offer),
      kind: 'offer' as const,
      source: 'offer-truth' as const,
    },
    {
      id: `offer.${offer.plan}.badge`,
      capabilityId: 'public-profile',
      statement: offer.badge,
      kind: 'offer' as const,
      source: 'offer-truth' as const,
    },
    {
      id: `offer.${offer.plan}.note`,
      capabilityId: 'public-profile',
      statement: offer.note,
      kind: 'offer' as const,
      source: 'offer-truth' as const,
    },
  ]);
}

function deriveEntitlementClaims(): Claim[] {
  return PUBLISHED_ENTITLEMENT_PLANS.flatMap(plan =>
    ENTITLEMENT_REGISTRY[plan].marketing.features
      .filter(feature => !PLAN_FEATURE_META.test(feature))
      .map(feature => ({
        id: `plan.${plan}.${slugifyClaimSegment(feature)}`,
        capabilityId: classifyPlanFeature(feature),
        statement: feature,
        kind: 'capability' as const,
        source: 'entitlements' as const,
      }))
  );
}

function deriveFeatureClaims(): Claim[] {
  return (
    Object.entries(PRODUCT_CAPABILITIES) as ReadonlyArray<
      [ProductCapabilityId, CapabilityDefinition]
    >
  ).flatMap(([capabilityId, definition]) => {
    const marketing = definition.marketing;
    if (!marketing) return [];
    const jobs: Claim[] = marketing.supportedJobs.map(job => ({
      id: `capability.${capabilityId}.${slugifyClaimSegment(job)}`,
      capabilityId,
      statement: job,
      kind: 'capability',
      source: 'feature',
    }));
    if (!marketing.accessLabel) return jobs;
    return [
      ...jobs,
      {
        id: `capability.${capabilityId}.access-label`,
        capabilityId,
        statement: marketing.accessLabel,
        kind: 'capability',
        source: 'feature',
      },
    ];
  });
}

/**
 * Hand-authored metric and comparison claims. Each entry needs a measured
 * or externally cited source, a citation, and a validUntil date:
 * never invent metrics.
 */
export const EVIDENCED_CLAIMS: readonly Claim[] = [
  {
    id: 'about.founder.live-shows',
    capabilityId: 'artist-profiles',
    statement: 'played more than 500 shows',
    kind: 'metric',
    source: 'external-cited',
    citation:
      'Linear JOV-7164 founder-history canon comment 23a2eb64-426e-43ff-a9c5-5311a40a99e9 (Tim White, 2026-09-29T17:15:42Z)',
    validUntil: '2027-09-30',
  },
];

let cachedClaims: readonly Claim[] | null = null;

export function listProductTruthClaims(): readonly Claim[] {
  cachedClaims ??= [
    ...deriveOfferClaims(),
    ...deriveEntitlementClaims(),
    ...deriveFeatureClaims(),
    ...EVIDENCED_CLAIMS,
    // Measured dogfood receipts (JOV-7750): `pnpm proof:dogfood`.
    ...dogfoodClaims(dogfoodReceipts as DogfoodReceiptsFile),
  ];
  return cachedClaims;
}
