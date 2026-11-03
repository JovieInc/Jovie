import { APP_ROUTES } from '@/constants/routes';

/**
 * Homepage header CTA (JOV-5085 conversion lock). A plain data module so the
 * server-rendered (home) layout and the client MarketingHeader share one value
 * without crossing the 'use client' boundary.
 */
// ui-casing-allow: shared CTA intent copy (sentence case, as on /artist-profiles)
export const HOME_MARKETING_HEADER_CTA = {
  label: 'Claim your profile',
  href: APP_ROUTES.START,
} as const;
