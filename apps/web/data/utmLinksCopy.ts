import { APP_ROUTES } from '@/constants/routes';

/** Deterministic values for the live builder on /product/utm-links. */
export const UTM_LINKS_FIXTURE = {
  baseUrl: 'https://jov.ie/you',
  values: {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: 'spring-drop',
    utm_content: 'header',
  },
} as const;

export const UTM_LINKS_RESULT_URL =
  'https://jov.ie/you?utm_source=newsletter&utm_medium=email&utm_campaign=spring-drop&utm_content=header';

export const UTM_LINKS_COPY = {
  seo: {
    title: 'UTM links',
    description:
      'A tracked link keeps the same destination and adds source, medium, campaign, term, and content.',
  },
  headline: 'UTM links',
  support:
    'A tracked link keeps the same destination and adds source, medium, campaign, term, and content.',
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;
