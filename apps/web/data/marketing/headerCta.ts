import { HOMEPAGE_INVITE_ANCHOR } from '@/data/homepageInviteAnchor';

/**
 * Homepage header CTA. A plain data module so the server-rendered (home)
 * layout and the client MarketingHeader share one value without crossing the
 * 'use client' boundary. Signup is invite-only (PUBLIC_SIGNUP_CLOSED), so the
 * header action scrolls to the homepage's own invitation form, the same
 * destination as the hero action.
 */
export const HOME_MARKETING_HEADER_CTA = {
  label: 'Request an Invite',
  href: `/#${HOMEPAGE_INVITE_ANCHOR}`,
} as const;
