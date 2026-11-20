import { APP_ROUTES } from '@/constants/routes';
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

export const CLAIM_PROFILE_STARTER_PROMPT = 'I want to claim my profile.';

export function buildClaimProfileStarterPrompt(handle?: string): string {
  const trimmedHandle = handle?.trim().replace(/^@/, '') ?? '';
  return trimmedHandle
    ? `I want to claim jov.ie/${trimmedHandle}.`
    : CLAIM_PROFILE_STARTER_PROMPT;
}

function buildOpenClaimProfileStartHref(trimmedHandle: string): string {
  const params = new URLSearchParams({
    starter_prompt: buildClaimProfileStarterPrompt(trimmedHandle),
    ...(trimmedHandle ? { handle: trimmedHandle } : {}),
  });
  return `${APP_ROUTES.START}?${params.toString()}`;
}

export function buildClaimProfileStartHref(handle?: string): string {
  return buildOpenClaimProfileStartHref(handle?.trim().replace(/^@/, '') ?? '');
}

// Every claim enters the /start qualify chat (Tim 2026-09-28, JOV-3379): the
// chat admits or reserves, so no front door routes to /signup or /waitlist.
// Always carry starter_prompt so landing on /start from / initiates the opener
// automatically with zero extra clicks.
const CLAIM_PROFILE_OPEN_SIGNUP_INTENT = {
  id: 'claim-profile',
  label: 'Claim your profile',
  href: buildClaimProfileStartHref(),
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

export type ClaimProfileCtaIntent = typeof CLAIM_PROFILE_OPEN_SIGNUP_INTENT;

export function getClaimProfileIntent(): ClaimProfileCtaIntent {
  return CLAIM_PROFILE_OPEN_SIGNUP_INTENT;
}
