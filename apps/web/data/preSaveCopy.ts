import { APP_ROUTES } from '@/constants/routes';

/** Deterministic release date for the live countdown on /product/pre-save. */
export const PRE_SAVE_FIXTURE = {
  releaseTitle: 'Night Drive',
  releaseAt: '2032-04-16T16:00:00.000Z',
} as const;

export const PRE_SAVE_COPY = {
  seo: {
    title: 'Pre-save',
    description:
      'The unreleased page renders a countdown to the release date. Jovie stores an encrypted refresh token for each account. A daily job saves the release into that library after the date passes.',
  },
  headline: 'Pre-save',
  support:
    'The unreleased page renders a countdown to the release date. Jovie stores an encrypted refresh token for each account. A daily job saves the release into that library after the date passes.',
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;
