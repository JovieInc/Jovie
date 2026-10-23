import { APP_ROUTES } from '@/constants/routes';

/**
 * Public copy for /product/link-analytics.
 * A smart link records each click, the provider that received it, and the time.
 */
export const LINK_ANALYTICS_COPY = {
  seo: {
    title: 'Link analytics',
    description:
      'A smart link records each click, the provider that received it, and the time. The panel lists the all-time total, the last seven days, and the provider with the most clicks.',
  },
  headline: 'Link analytics',
  support:
    'A smart link records each click, the provider that received it, and the time. The panel lists the all-time total, the last seven days, and the provider with the most clicks.',
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;
