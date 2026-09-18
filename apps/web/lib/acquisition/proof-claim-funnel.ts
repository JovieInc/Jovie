/**
 * JOV-6440 — M1 proof profile → claim CTA → checkout → activation.
 *
 * The founder proof account (`/tim`) is the acquisition asset. This module is
 * the stable contract: identity, offer, CTA, event names, and conversion math.
 * Do not fork a second proof-claim funnel.
 *
 * controller-hop-exception: jovie-controller-hop/v1
 * accountable-writer: Summer
 * necessary-trust-boundary: Hosted Size Guard remediates on this same PR
 *   (#17963) via the big-pr opt-out instead of a sibling remediator PR.
 * removal-trigger: Drop big-pr after Size Guard records the bypass and
 *   PR Ready is green on this head, or after the PR lands.
 */

import { APP_ROUTES } from '@/constants/routes';
import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
import {
  ARTIST_VISIBILITY_OFFER,
  getPlanSignupHref,
} from '@/lib/billing/offer-truth';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export const PROOF_CLAIM_CAMPAIGN_KEY = 'proof-to-claim' as const;
export const PROOF_CLAIM_VARIANT_ID = 'proof-to-claim:m1:v1' as const;
export const PROOF_CLAIM_SOURCE = 'proof_profile' as const;

export const PROOF_CLAIM_FUNNEL_EVENTS = {
  PROOF_VIEWED: 'proof_viewed',
  CLAIM_STARTED: 'claim_started',
  CHECKOUT: 'checkout',
  ACTIVATION: 'activation',
} as const;

export type ProofClaimFunnelEvent =
  (typeof PROOF_CLAIM_FUNNEL_EVENTS)[keyof typeof PROOF_CLAIM_FUNNEL_EVENTS];

export const PROOF_CLAIM_FUNNEL_EVENT_NAMES = [
  PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED,
  PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED,
  PROOF_CLAIM_FUNNEL_EVENTS.CHECKOUT,
  PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION,
] as const satisfies readonly ProofClaimFunnelEvent[];

export const PROOF_CLAIM_ACTIVATION_ALIASES = [
  PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION,
  'onboarding_completed',
  'paid_converted',
] as const;

export const PROOF_CLAIM_CHECKOUT_ALIASES = [
  PROOF_CLAIM_FUNNEL_EVENTS.CHECKOUT,
  'onboarding_checkout_shown',
  'onboarding_checkout_initiated',
] as const;

export const PROOF_PROFILE = {
  handle: TIM_WHITE_PROFILE.publicProfileHandle,
  displayName: TIM_WHITE_PROFILE.name,
  path: TIM_WHITE_PROFILE.publicProfilePath,
} as const;

export function isProofProfileHandle(
  handle: string | null | undefined
): boolean {
  const normalized = handle?.trim().replace(/^@/, '').toLowerCase();
  return normalized === PROOF_PROFILE.handle;
}

export function isProofClaimFunnelEvent(
  value: string
): value is ProofClaimFunnelEvent {
  return (PROOF_CLAIM_FUNNEL_EVENT_NAMES as readonly string[]).includes(value);
}

export function proofClaimAttribution() {
  return {
    campaignKey: PROOF_CLAIM_CAMPAIGN_KEY,
    variantKey: PROOF_CLAIM_VARIANT_ID,
    source: PROOF_CLAIM_SOURCE,
    experimentId: PROOF_CLAIM_CAMPAIGN_KEY,
  } as const;
}

export interface ProofClaimOffer {
  readonly product: 'Artist Visibility Pro';
  readonly monthlyUsd: number;
  readonly currency: 'usd';
  readonly interval: 'month';
}

export function getProofClaimOffer(): ProofClaimOffer {
  return {
    product: 'Artist Visibility Pro',
    monthlyUsd: ARTIST_VISIBILITY_OFFER.pro.monthlyUsd,
    currency: ARTIST_VISIBILITY_OFFER.pro.currency,
    interval: ARTIST_VISIBILITY_OFFER.pro.interval,
  };
}

export interface ProofClaimCta {
  readonly label: string;
  readonly href: string;
  readonly note: string;
  readonly support: string;
  readonly limited: boolean;
  readonly offer: ProofClaimOffer;
}

function withProofClaimParams(href: string): string {
  const url = new URL(href, 'https://jov.ie');
  url.searchParams.set('campaign', PROOF_CLAIM_CAMPAIGN_KEY);
  url.searchParams.set('utm_source', PROOF_CLAIM_SOURCE);
  url.searchParams.set('utm_campaign', PROOF_CLAIM_CAMPAIGN_KEY);
  url.searchParams.set('utm_content', PROOF_CLAIM_VARIANT_ID);
  return `${url.pathname}${url.search}`;
}

export function buildProofClaimHref(waitlistEnabled: boolean): string {
  if (waitlistEnabled) {
    const waitlist = new URL(PUBLIC_WAITLIST_URL);
    return withProofClaimParams(
      `${APP_ROUTES.WAITLIST}${waitlist.search ? waitlist.search : ''}`
    );
  }

  return withProofClaimParams(getPlanSignupHref('pro', 'month'));
}

export function resolveProofClaimCta(
  waitlistEnabled: boolean = FEATURE_FLAGS.WAITLIST_ENABLED
): ProofClaimCta {
  const offer = getProofClaimOffer();
  if (waitlistEnabled) {
    return {
      label: 'Request access',
      href: buildProofClaimHref(true),
      note: 'Limited · Request access',
      support: 'Limited prelaunch access. We will email when you are in.',
      limited: true,
      offer,
    };
  }

  return {
    label: 'Get yours',
    href: buildProofClaimHref(false),
    note: `${offer.product} · $${offer.monthlyUsd}/mo`,
    support: `${offer.product} is $${offer.monthlyUsd}/mo.`,
    limited: false,
    offer,
  };
}

export interface ProofClaimFunnelCounts {
  readonly proofViewed: number;
  readonly claimStarted: number;
  readonly checkout: number;
  readonly activation: number;
}

export interface ProofClaimFunnelRates {
  readonly viewToClaim: number | null;
  readonly claimToCheckout: number | null;
  readonly checkoutToActivation: number | null;
}

export interface ProofClaimFunnelReport {
  readonly campaignKey: typeof PROOF_CLAIM_CAMPAIGN_KEY;
  readonly variantKey: typeof PROOF_CLAIM_VARIANT_ID;
  readonly stages: ProofClaimFunnelCounts;
  readonly rates: ProofClaimFunnelRates;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function rateProofClaimFunnel(
  stages: ProofClaimFunnelCounts
): ProofClaimFunnelRates {
  return {
    viewToClaim: ratio(stages.claimStarted, stages.proofViewed),
    claimToCheckout: ratio(stages.checkout, stages.claimStarted),
    checkoutToActivation: ratio(stages.activation, stages.checkout),
  };
}

export function queryProofClaimFunnel(
  events: readonly { readonly eventType: string }[]
): ProofClaimFunnelReport {
  const stages = {
    proofViewed: 0,
    claimStarted: 0,
    checkout: 0,
    activation: 0,
  };

  for (const event of events) {
    if (event.eventType === PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED) {
      stages.proofViewed += 1;
    } else if (event.eventType === PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED) {
      stages.claimStarted += 1;
    } else if (
      (PROOF_CLAIM_CHECKOUT_ALIASES as readonly string[]).includes(
        event.eventType
      )
    ) {
      stages.checkout += 1;
    } else if (
      (PROOF_CLAIM_ACTIVATION_ALIASES as readonly string[]).includes(
        event.eventType
      )
    ) {
      stages.activation += 1;
    }
  }

  return {
    campaignKey: PROOF_CLAIM_CAMPAIGN_KEY,
    variantKey: PROOF_CLAIM_VARIANT_ID,
    stages,
    rates: rateProofClaimFunnel(stages),
  };
}

export function hasProofClaimCampaign(
  campaignKey: string | null | undefined
): boolean {
  return campaignKey === PROOF_CLAIM_CAMPAIGN_KEY;
}
