import { APP_ROUTES } from '@/constants/routes';

/**
 * Public copy for /product/release-scheduling.
 * A future release date is stored as scheduled.
 * A blank reveal date stays off the public profile until release day.
 * Once the reveal date has passed, the public page counts down.
 */
export const RELEASE_SCHEDULING_COPY = {
  seo: {
    title: 'Release scheduling',
    description:
      'A future release date is stored as scheduled. Leave the reveal date blank to keep the page off the public profile until release day. After the reveal date, the page counts down to release.',
  },
  headline: 'Release scheduling',
  support:
    'A future release date is stored as scheduled. Leave the reveal date blank to keep the page off the public profile until release day. After the reveal date, the page counts down to release.',
  fields: {
    releaseDate: 'Release Date',
    revealDate: 'Reveal Date',
    revealHelp:
      'Leave blank to keep this off the public profile until release day.',
  },
  fixture: {
    releaseDate: '2026-11-20',
    revealDate: '2026-11-06',
  },
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;
