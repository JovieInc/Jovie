import { APP_NAME, APP_URL } from '@/constants/app';

/** Safely serialize JSON-LD with XSS protection */
export const jsonLd = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', String.raw`\u003c`);

/** Reusable schema fragments shared across marketing pages */
export const SCHEMA_FRAGMENTS = {
  offers: {
    '@type': 'Offer' as const,
    price: '0',
    priceCurrency: 'USD',
    description: 'Free to start',
  },
  aggregateRating: {
    '@type': 'AggregateRating' as const,
    ratingValue: '5',
    ratingCount: '1',
    bestRating: '5',
    worstRating: '1',
  },
  author: {
    '@type': 'Organization' as const,
    name: APP_NAME,
    url: APP_URL,
  },
  logo: {
    '@type': 'ImageObject' as const,
    url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
    width: 512,
    height: 512,
  },
  publisher: {
    '@type': 'Organization' as const,
    name: APP_NAME,
    url: APP_URL,
    logo: {
      '@type': 'ImageObject' as const,
      url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
      width: 512,
      height: 512,
    },
  },
  searchAction: {
    '@type': 'SearchAction' as const,
    target: {
      '@type': 'EntryPoint' as const,
      urlTemplate: `${APP_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  contactPoint: {
    '@type': 'ContactPoint' as const,
    contactType: 'customer support',
    url: `${APP_URL}/support`,
  },
} as const;

/** Build a WebSite schema with page-specific overrides */
export function buildWebsiteSchema(overrides: {
  description: string;
  alternateName: string | string[];
}) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    alternateName: overrides.alternateName,
    description: overrides.description,
    url: APP_URL,
    inLanguage: 'en-US',
    potentialAction: SCHEMA_FRAGMENTS.searchAction,
    publisher: SCHEMA_FRAGMENTS.publisher,
  });
}

/** Build a SoftwareApplication schema with page-specific description */
export function buildSoftwareSchema(description: string) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: APP_NAME,
    description,
    url: APP_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: SCHEMA_FRAGMENTS.offers,
    aggregateRating: SCHEMA_FRAGMENTS.aggregateRating,
    author: SCHEMA_FRAGMENTS.author,
  });
}

/** Build an Organization schema with page-specific overrides */
export function buildOrganizationSchema(overrides: {
  legalName: string;
  description: string;
  sameAs: string[];
}) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    legalName: overrides.legalName,
    url: APP_URL,
    logo: SCHEMA_FRAGMENTS.logo,
    image: `${APP_URL}/og/default.png`,
    description: overrides.description,
    sameAs: overrides.sameAs,
    contactPoint: SCHEMA_FRAGMENTS.contactPoint,
  });
}
