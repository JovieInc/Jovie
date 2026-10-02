import { APP_ROUTES } from '@/constants/routes';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

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

// Every claim enters the /start qualify chat (Tim 2026-09-28, JOV-3379): the
// chat admits or reserves, so no front door routes to /signup or /waitlist.
const CLAIM_PROFILE_WAITLIST_INTENT = {
  id: 'claim-profile',
  label: 'Claim your profile',
  href: APP_ROUTES.START,
  eventName: 'landing_cta_claim_profile',
  support: 'Limited access. Reserve your name now.',
} as const satisfies MarketingCtaIntent;

const CLAIM_PROFILE_OPEN_SIGNUP_INTENT = {
  id: 'claim-profile',
  label: 'Claim your profile',
  href: APP_ROUTES.START,
  eventName: 'landing_cta_claim_profile',
  support: 'Free to start. No credit card.',
} as const satisfies MarketingCtaIntent;

export const MARKETING_CTA_INTENTS = {
  claimProfile: getClaimProfileIntent(),
  seeLiveProfile: {
    id: 'see-live-profile',
    label: 'See a live profile',
    href: TIM_WHITE_PROFILE.publicProfilePath,
    eventName: 'landing_cta_see_live_profile',
    support: '',
  },
} as const satisfies Record<string, MarketingCtaIntent>;

export type ClaimProfileCtaIntent =
  | typeof CLAIM_PROFILE_WAITLIST_INTENT
  | typeof CLAIM_PROFILE_OPEN_SIGNUP_INTENT;

function buildOpenClaimProfileStartHref(trimmedHandle: string): string {
  if (!trimmedHandle) return APP_ROUTES.START;

  const params = new URLSearchParams({
    starter_prompt: `I want to claim jov.ie/${trimmedHandle}.`,
    handle: trimmedHandle,
  });
  return `${APP_ROUTES.START}?${params.toString()}`;
}

export function buildClaimProfileStartHref(handle?: string): string {
  return buildOpenClaimProfileStartHref(handle?.trim().replace(/^@/, '') ?? '');
}

export function getClaimProfileIntent(
  waitlistEnabled: boolean = FEATURE_FLAGS.WAITLIST_ENABLED
): ClaimProfileCtaIntent {
  return waitlistEnabled
    ? CLAIM_PROFILE_WAITLIST_INTENT
    : CLAIM_PROFILE_OPEN_SIGNUP_INTENT;
}
