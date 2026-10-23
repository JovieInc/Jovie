import { APP_ROUTES } from '@/constants/routes';

/**
 * Public copy for /product/traffic-quality.
 * Owner visits and clicks are dropped in the tracking routes.
 * A bot visit is filtered before it is stored.
 * Click counts skip rows marked as bots.
 */
export const TRAFFIC_QUALITY_COPY = {
  seo: {
    title: 'Traffic quality',
    description:
      'Signed-in owner visits and clicks are not stored. A bot visit is dropped before it is stored. Counts skip click rows marked as bots.',
  },
  headline: 'Traffic quality',
  support:
    'Signed-in owner visits and clicks are not stored. A bot visit is dropped before it is stored. Counts skip click rows marked as bots.',
  filter: {
    title: 'Traffic Quality Filtering',
    highQuality: 'High quality only',
    allTraffic: 'All traffic',
    ariaLabel: 'Toggle Traffic Quality Filtering',
  },
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;
