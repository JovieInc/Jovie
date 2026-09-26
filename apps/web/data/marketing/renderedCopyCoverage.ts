/**
 * Rendered-copy coverage inventory (JOV-6478).
 *
 * The meaning-first copy system in `copy.ts` certifies reviewed words; the
 * rendered audit certifies that a route or UI state renders exactly those
 * words and nothing the allowed claims cannot support. This module owns the
 * first owner-routed slice: the `/pricing` marketing route and the public
 * error-fallback UI state.
 *
 * Authorities consumed, not rewritten:
 * - Pricing truth: `lib/billing/offer-truth.ts` + `lib/config/plan-prices.ts`
 *   (JOV-5814 / JOV-6223). Claim statements here quote that contract; claim
 *   evidence points at it. A price or availability change there makes the
 *   rendered text diverge from this reviewed snapshot and invalidates every
 *   certification.
 * - UI recovery truth: `components/features/feedback/recovery-contract.ts`
 *   (`RECOVERY_COPY`) rendered by `SystemBErrorFallback` /
 *   `PublicPageErrorFallback`.
 * - Marketing vocabulary: docs/marketing/LANGUAGE.md (JOV-6432).
 *
 * Rendered surfaces are produced by mounted-render adapters in the test
 * suite; this file stays DOM-free so it can also certify server captures.
 */

import type {
  MarketingCopyLineBinding,
  MarketingCopyLineRole,
  MarketingCopyPageBrief,
  MarketingCopyPageDraft,
  MarketingCopySectionBrief,
  MarketingCopySectionDraft,
} from './copy';

export interface RenderedCopyCoverageEntry {
  readonly surfaceId: string;
  readonly kind: 'marketing-route' | 'ui-state';
  readonly route: string;
  readonly state: string;
  readonly owner: string;
  readonly componentPaths: readonly string[];
  readonly gaps: readonly string[];
}

/** Explicit owner-routed coverage; each entry links one rendered surface to its briefs. */
export const RENDERED_COPY_COVERAGE_INVENTORY: readonly RenderedCopyCoverageEntry[] =
  [
    {
      surfaceId: 'pricing-page',
      kind: 'marketing-route',
      route: '/pricing',
      state: 'default',
      owner: 'JOV-6478',
      componentPaths: [
        'apps/web/app/(marketing)/pricing/page.tsx',
        'apps/web/components/organisms/PricingRecipeBody.tsx',
        'apps/web/components/features/pricing/MarketingPricingPlans.tsx',
      ],
      gaps: [
        'Comparison chart rows render feature availability names not yet bound to claims.',
        'JSON-LD offer schema is machine copy and outside the visible-line audit.',
      ],
    },
    {
      surfaceId: 'public-error-fallback',
      kind: 'ui-state',
      route: 'state:public-error-fallback',
      state: 'error',
      owner: 'JOV-6478',
      componentPaths: [
        'apps/web/components/providers/PublicPageErrorFallback.tsx',
        'apps/web/components/providers/SystemBErrorFallback.tsx',
        'apps/web/components/features/feedback/recovery-contract.ts',
      ],
      gaps: [
        'Error details disclosure renders a support digest, not marketing copy.',
        'Other error presenters (chat cards, form banners) are separate states.',
      ],
    },
  ];

const PRICING_EVIDENCE = {
  freeTruth: 'apps/web/lib/billing/offer-truth.ts:FREE_PROFILE_TRUTH',
  freePrice:
    'apps/web/lib/config/plan-prices.ts:ARTIST_VISIBILITY_OFFER.free (priceUsd=0)',
  proPrice:
    'apps/web/lib/config/plan-prices.ts:ARTIST_VISIBILITY_OFFER.pro.monthlyUsd=199',
  proAccess: 'apps/web/lib/billing/offer-truth.ts:PRO_LIMITED_ACCESS_TRUTH',
  enterprise:
    'apps/web/lib/billing/offer-truth.ts:PUBLIC_CUSTOM_PRICE_LABEL + ARTIST_VISIBILITY_OFFER.enterprise',
} as const;

function briefSection(
  sectionId: string,
  storyBeat: string,
  sectionJob: string,
  customerOutcome: string,
  messageSubject: string,
  visualEvidence: string,
  allowedClaimIds: readonly string[],
  headlineWordLimit: number,
  headlineSignals: readonly (readonly string[])[],
  extra?: Pick<MarketingCopySectionBrief, 'bodyWordLimit' | 'requiredActionIds'>
): MarketingCopySectionBrief {
  return {
    sectionId,
    storyBeat,
    sectionJob,
    customerOutcome,
    messageSubject,
    visualEvidence,
    allowedClaimIds,
    headlineWordLimit,
    headlineSignals,
    ...extra,
  };
}

export function pricingPageCopyBrief(): MarketingCopyPageBrief {
  return {
    pageId: 'pricing',
    route: '/pricing',
    audience: 'independent artists and teams comparing plans',
    objective:
      'let the visitor claim a free profile, request Pro access, or contact sales',
    claims: [
      {
        id: 'free-forever',
        statement: 'Artist profiles are free forever at $0.',
        evidence: [PRICING_EVIDENCE.freeTruth, PRICING_EVIDENCE.freePrice],
      },
      {
        id: 'pro-price',
        statement: 'Artist Visibility Pro is $199/month with limited access.',
        evidence: [PRICING_EVIDENCE.proPrice, PRICING_EVIDENCE.proAccess],
      },
      {
        id: 'enterprise-custom',
        statement: 'Enterprise pricing is custom; contact sales.',
        evidence: [PRICING_EVIDENCE.enterprise],
      },
    ],
    outcomes: [
      {
        id: 'choose-plan',
        statement:
          'The visitor can pick a plan or request the access that fits them.',
      },
    ],
    actions: [
      { id: 'claim-free', statement: 'Claim my free profile.' },
      { id: 'request-access', statement: 'Request access to Pro.' },
      { id: 'contact-sales', statement: 'Contact sales for Enterprise.' },
      { id: 'explore-profiles', statement: 'Explore Artist Profiles.' },
    ],
    sections: [
      briefSection(
        'hero',
        'promise',
        'name the offer and the price truth',
        'the visitor sees the real plans and prices',
        'pricing',
        'plan cards with live prices',
        ['free-forever', 'pro-price'],
        4,
        [['pricing']],
        { bodyWordLimit: 30 }
      ),
      briefSection(
        'plan-free',
        'offer',
        'present the free plan',
        'the visitor can claim a profile at no cost',
        'free plan',
        'the free plan card',
        ['free-forever'],
        3,
        [['free']]
      ),
      briefSection(
        'plan-pro',
        'offer',
        'present the Pro plan and its price',
        'the visitor can request Pro access at the real price',
        'pro plan',
        'the pro plan card',
        ['pro-price'],
        3,
        [['pro']],
        { bodyWordLimit: 8 }
      ),
      briefSection(
        'plan-enterprise',
        'offer',
        'present the Enterprise path',
        'teams can reach sales for custom pricing',
        'enterprise plan',
        'the enterprise plan card',
        ['enterprise-custom'],
        3,
        [['enterprise']],
        { bodyWordLimit: 8 }
      ),
      briefSection(
        'compare',
        'proof',
        'offer the feature comparison',
        'the visitor can compare what each plan includes',
        'feature comparison',
        'the comparison chart',
        ['free-forever'],
        4,
        [['compare'], ['features']],
        { bodyWordLimit: 12 }
      ),
      briefSection(
        'final',
        'close',
        'close with the access actions',
        'the visitor leaves through a real action',
        'get started',
        'the closing action row',
        ['free-forever', 'pro-price'],
        3,
        [['get started', 'started']],
        { bodyWordLimit: 16 }
      ),
    ],
  };
}

type BindingRef =
  | { readonly claim: string }
  | { readonly claims: readonly string[] }
  | { readonly action: string }
  | { readonly outcome: string };

const roleOf = (lineId: string): MarketingCopyLineRole =>
  lineId === 'headline'
    ? 'headline'
    : lineId === 'body'
      ? 'body'
      : 'supporting';

/** Compact `[lineId, ref]` rows → reviewed line bindings. */
function bind(
  entries: readonly (readonly [string, BindingRef])[]
): MarketingCopyLineBinding[] {
  return entries.map(([lineId, ref]) => ({
    lineId,
    role: roleOf(lineId),
    ...('claim' in ref
      ? { claimIds: [ref.claim] }
      : 'claims' in ref
        ? { claimIds: ref.claims }
        : 'action' in ref
          ? { actionId: ref.action }
          : { outcomeId: ref.outcome }),
  }));
}

function pricingSection(
  partial: Omit<
    MarketingCopySectionDraft,
    'control' | 'meaningTrace' | 'tasteTags' | 'lineBindings'
  > & {
    readonly controlHeadline: string;
    readonly lineBindings: readonly (readonly [string, BindingRef])[];
  }
): MarketingCopySectionDraft {
  const { controlHeadline, lineBindings, ...rest } = partial;
  return {
    ...rest,
    control: { headline: controlHeadline },
    lineBindings: bind(lineBindings),
    meaningTrace: 'The reviewed words name the plan truth the visitor acts on.',
    tasteTags: ['direct', 'specific'],
  };
}

/**
 * The reviewed candidate for `/pricing`: a frozen snapshot of the words the
 * page was certified to render. It intentionally quotes offer truth rather
 * than deriving from it — a drifted render must fail, not move the target.
 */
export function pricingPageReviewedDraft(): MarketingCopyPageDraft {
  return {
    pageId: 'pricing',
    route: '/pricing',
    sections: [
      pricingSection({
        sectionId: 'hero',
        candidateId: 'pricing-hero-v1',
        controlHeadline: 'Plans and pricing',
        headline: 'Pricing',
        body: 'Artist profiles are free forever. Artist Visibility Pro is $199/month with limited access.',
        supportingText: [
          'Claim my free profile',
          'Explore Artist Profiles',
          'Profile',
          'Public artist profile and audience capture',
          'Claim profile same day.',
        ],
        claimIds: ['free-forever', 'pro-price'],
        lineBindings: [
          ['headline', { outcome: 'choose-plan' }],
          ['body', { claims: ['free-forever', 'pro-price'] }],
          ['supporting:0', { action: 'claim-free' }],
          ['supporting:1', { action: 'explore-profiles' }],
          ['supporting:2', { outcome: 'choose-plan' }],
          ['supporting:3', { claim: 'free-forever' }],
          ['supporting:4', { action: 'claim-free' }],
        ],
      }),
      pricingSection({
        sectionId: 'plan-free',
        candidateId: 'pricing-plan-free-v1',
        controlHeadline: 'Free plan',
        headline: 'Free',
        body: 'Your artist profile stays free forever. Downgrading restores Jovie branding and keeps audience capture.',
        supportingText: [
          'Free forever',
          '$0',
          'Claim my free profile',
          'Public artist profile and audience capture',
        ],
        claimIds: ['free-forever'],
        lineBindings: [
          ['headline', { claim: 'free-forever' }],
          ['body', { claim: 'free-forever' }],
          ['supporting:0', { claim: 'free-forever' }],
          ['supporting:1', { claim: 'free-forever' }],
          ['supporting:2', { action: 'claim-free' }],
          ['supporting:3', { claim: 'free-forever' }],
        ],
      }),
      pricingSection({
        sectionId: 'plan-pro',
        candidateId: 'pricing-plan-pro-v1',
        controlHeadline: 'Pro plan',
        headline: 'Pro',
        body: 'Limited access.',
        supportingText: [
          'Limited access',
          '$199/mo',
          'Request access',
          'Public artist profile and audience capture',
        ],
        claimIds: ['pro-price'],
        lineBindings: [
          ['headline', { claim: 'pro-price' }],
          ['body', { claim: 'pro-price' }],
          ['supporting:0', { claim: 'pro-price' }],
          ['supporting:1', { claim: 'pro-price' }],
          ['supporting:2', { action: 'request-access' }],
          ['supporting:3', { claim: 'pro-price' }],
        ],
      }),
      pricingSection({
        sectionId: 'plan-enterprise',
        candidateId: 'pricing-plan-enterprise-v1',
        controlHeadline: 'Enterprise plan',
        headline: 'Enterprise',
        body: 'Scope by agreement.',
        supportingText: ['Contact sales', 'Custom', 'Contact sales'],
        claimIds: ['enterprise-custom'],
        lineBindings: [
          ['headline', { claim: 'enterprise-custom' }],
          ['body', { claim: 'enterprise-custom' }],
          ['supporting:0', { claim: 'enterprise-custom' }],
          ['supporting:1', { claim: 'enterprise-custom' }],
          ['supporting:2', { action: 'contact-sales' }],
        ],
      }),
      pricingSection({
        sectionId: 'compare',
        candidateId: 'pricing-compare-v1',
        controlHeadline: 'Feature comparison',
        headline: 'Compare All Features',
        body: 'Public artist profile and audience capture.',
        claimIds: ['free-forever'],
        lineBindings: [
          ['headline', { outcome: 'choose-plan' }],
          ['body', { claim: 'free-forever' }],
        ],
      }),
      pricingSection({
        sectionId: 'final',
        candidateId: 'pricing-final-v1',
        controlHeadline: 'Pick a plan',
        headline: 'Get Started',
        body: 'Artist Visibility Pro is $199/month with limited access. Request access.',
        supportingText: [
          'Claim my free profile',
          'Request access',
          'Contact sales',
        ],
        claimIds: ['pro-price'],
        lineBindings: [
          ['headline', { outcome: 'choose-plan' }],
          ['body', { claim: 'pro-price' }],
          ['supporting:0', { action: 'claim-free' }],
          ['supporting:1', { action: 'request-access' }],
          ['supporting:2', { action: 'contact-sales' }],
        ],
      }),
    ],
  };
}

export function publicErrorFallbackCopyBrief(): MarketingCopyPageBrief {
  return {
    pageId: 'public-error-fallback',
    route: 'state:public-error-fallback',
    audience: 'a visitor who hit an unexpected page error',
    objective: 'acknowledge the failure and give one concrete recovery path',
    claims: [
      {
        id: 'error-disclosure',
        statement:
          'The page reports an unexpected error and offers one recovery action.',
        evidence: [
          'apps/web/components/providers/PublicPageErrorFallback.tsx',
          'apps/web/components/features/feedback/recovery-contract.ts',
        ],
      },
    ],
    outcomes: [
      {
        id: 'acknowledge-failure',
        statement:
          'The visitor knows the page hit an unexpected error, not their action.',
        claimIds: ['error-disclosure'],
      },
    ],
    actions: [{ id: 'retry', statement: 'Try again to reload the page.' }],
    sections: [
      briefSection(
        'error-fallback',
        'recovery',
        'name the failure and the one recovery action',
        'the visitor can retry instead of abandoning',
        'unexpected error',
        'the error fallback panel',
        ['error-disclosure'],
        6,
        [['went wrong', 'wrong']],
        { bodyWordLimit: 8, requiredActionIds: ['retry'] }
      ),
    ],
  };
}

export function publicErrorFallbackReviewedDraft(): MarketingCopyPageDraft {
  return {
    pageId: 'public-error-fallback',
    route: 'state:public-error-fallback',
    sections: [
      {
        sectionId: 'error-fallback',
        candidateId: 'public-error-fallback-v1',
        control: { headline: 'This page failed' },
        headline: 'Something went wrong',
        body: 'Try refreshing the page.',
        supportingText: ['Try again'],
        claimIds: ['error-disclosure'],
        lineBindings: bind([
          ['headline', { outcome: 'acknowledge-failure' }],
          ['body', { action: 'retry' }],
          ['supporting:0', { action: 'retry' }],
        ]),
        meaningTrace:
          'The words acknowledge the failure and hand the visitor one real action.',
        tasteTags: ['plain', 'direct'],
      },
    ],
  };
}
