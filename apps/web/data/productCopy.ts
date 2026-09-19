import { APP_ROUTES } from '@/constants/routes';
import { buildClaimProfileStartHref } from '@/data/marketingCtaIntents';

/**
 * Locked /product marketing hero — Tim DESIGN_READY 2026-09-17.
 * Do not change copy without a new founder lock.
 */
export const PRODUCT_COPY = {
  seo: {
    title: 'Be found. Be understood.',
    description:
      'Turn attention into relationships—without becoming more noise.',
  },
  hero: {
    kicker: 'PRODUCT',
    headline: 'Be found. Be understood.',
    support: 'Turn attention into relationships—without becoming more noise.',
  },
  claimCard: {
    status: 'UNCLAIMED',
    domain: 'jov.ie/',
    handle: 'you',
    pathLabel: 'jov.ie/you',
    outcome: 'Claim the page that shows up when people search for you.',
    proof: 'Free · Spotify verified',
    cta: 'Claim',
  },
} as const;

export const PRODUCT_CLAIM_HREF = buildClaimProfileStartHref(
  PRODUCT_COPY.claimCard.handle
);

export const PRODUCT_PATH = APP_ROUTES.PRODUCT;
