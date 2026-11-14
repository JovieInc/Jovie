import { getClaimProfileIntent } from '@/data/marketingCtaIntents';

/**
 * Homepage header CTA. A plain data module so the server-rendered (home)
 * layout and the client MarketingHeader share one value without crossing the
 * 'use client' boundary. Public signup is open (2026-11-09), so the header
 * names the homepage's one action, the shared claim-profile intent into
 * `/start`, the same destination as the hero action (Tim, 2026-11-12 23:46Z:
 * "Switch it"). While the `PUBLIC_SIGNUP_CLOSED` kill switch is on, `/start`
 * itself redirects to the waitlist.
 */
const CLAIM_PROFILE_INTENT = getClaimProfileIntent();

export const HOME_MARKETING_HEADER_CTA = {
  label: CLAIM_PROFILE_INTENT.label,
  href: CLAIM_PROFILE_INTENT.href,
} as const;
