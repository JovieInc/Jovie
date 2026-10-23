import { APP_ROUTES } from '@/constants/routes';

/** Deterministic release and track codes for the live field on /product/isrc. */
export const ISRC_FIXTURE = {
  releaseTitle: 'Night Drive',
  primaryIsrc: 'USRC17607839',
  tracks: [{ title: 'Afterglow', isrc: 'USRC17607840' }],
} as const;

export const ISRC_COPY = {
  seo: {
    title: 'ISRC',
    description:
      'A release stores one primary ISRC. Each track stores its own. The field strips separators and uppercases the rest. It accepts the code only when it is two letters, three letters or digits, then seven digits.',
  },
  headline: 'ISRC',
  support:
    'A release stores one primary ISRC. Each track stores its own. The field strips separators and uppercases the rest. It accepts the code only when it is two letters, three letters or digits, then seven digits.',
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;
