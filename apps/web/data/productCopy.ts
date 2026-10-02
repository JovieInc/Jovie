import { APP_ROUTES } from '@/constants/routes';
import { buildClaimProfileStartHref } from '@/data/marketingCtaIntents';

/**
 * /product marketing hero. Tim 2026-09-28: "Be found. Be understood." moved to
 * the homepage link-claim hero; /product took the former homepage line.
 */
export const PRODUCT_COPY = {
  seo: {
    title: 'Your living identity on the internet',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
  hero: {
    kicker: 'PRODUCT',
    headline: 'Your living identity on the internet.',
    support:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
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
  close: {
    // Pen dClrT/DbI9f: two-line close headline with an explicit break.
    headlineLine1: 'See what shows up',
    headlineLine2: 'when people search for you.',
  },
} as const;

export const PRODUCT_CLAIM_HREF = buildClaimProfileStartHref(
  PRODUCT_COPY.claimCard.handle
);

export const PRODUCT_PATH = APP_ROUTES.PRODUCT;
