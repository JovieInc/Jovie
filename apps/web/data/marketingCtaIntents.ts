import { APP_ROUTES } from '@/constants/routes';
import {
  buildHomepageStartHref,
  HOMEPAGE_REQUEST_ACCESS_STARTER_PROMPT,
} from '@/data/homepageFrontDoorCta';

/**
 * Single shared CTA intent registry for public marketing surfaces.
 *
 * Label, route, analytics event, and support copy must stay truthful and
 * consistent across hero forms, terminal CTAs, and section actions. Prefer
 * these intents over hardcoding claim/start destinations per page.
 */
export type MarketingCtaIntentId =
  | 'claim-profile'
  | 'claim-profile-with-handle'
  | 'see-live-profile';

export interface MarketingCtaIntent {
  readonly id: MarketingCtaIntentId;
  readonly label: string;
  readonly href: string;
  readonly eventName: string;
  /** Quiet support line under primary claim actions ("free to start"). */
  readonly support: string;
}

export const MARKETING_CTA_INTENTS = {
  claimProfile: {
    id: 'claim-profile',
    label: 'Claim your profile',
    href: buildHomepageStartHref(HOMEPAGE_REQUEST_ACCESS_STARTER_PROMPT),
    eventName: 'landing_cta_claim_profile',
    support: 'Free to start. No credit card.',
  },
  seeLiveProfile: {
    id: 'see-live-profile',
    label: 'See a live profile',
    href: APP_ROUTES.ARTIST_PROFILES,
    eventName: 'landing_cta_see_live_profile',
    support: '',
  },
} as const satisfies Record<string, MarketingCtaIntent>;

export type ClaimProfileCtaIntent =
  (typeof MARKETING_CTA_INTENTS)['claimProfile'];

export function buildClaimProfileStartHref(handle?: string): string {
  const trimmed = handle?.trim().replace(/^@/, '') ?? '';
  if (!trimmed) {
    return MARKETING_CTA_INTENTS.claimProfile.href;
  }

  const params = new URLSearchParams({
    starter_prompt: `I want to claim jov.ie/${trimmed}.`,
    handle: trimmed,
  });
  return `${APP_ROUTES.START}?${params.toString()}`;
}

export function getClaimProfileIntent(): ClaimProfileCtaIntent {
  return MARKETING_CTA_INTENTS.claimProfile;
}
