import { HOMEPAGE_COPY } from '@/data/homepageCopy';

/**
 * Homepage header CTA (JOV-5085 conversion lock). A plain data module so the
 * server-rendered (home) layout and the client MarketingHeader share one value
 * without crossing the 'use client' boundary.
 */
// ui-casing-allow: shared CTA intent copy (sentence case, as on /artist-profiles)
export const HOME_MARKETING_HEADER_CTA = {
  label: HOMEPAGE_COPY.access.label,
  href: HOMEPAGE_COPY.access.href,
} as const;
