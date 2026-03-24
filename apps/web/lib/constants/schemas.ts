import { APP_NAME, APP_URL } from '@/constants/app';

/** Safely serialize JSON-LD with XSS protection */
export const jsonLd = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', String.raw`\u003c`);

/** Schema entity IDs for consistent knowledge graph across pages */
export const SCHEMA_IDS = {
  organization: `${APP_URL}#organization`,
  website: `${APP_URL}#website`,
  software: `${APP_URL}#software`,
} as const;

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
    '@id': SCHEMA_IDS.website,
    name: APP_NAME,
    alternateName: overrides.alternateName,
    description: overrides.description,
    url: APP_URL,
    inLanguage: 'en-US',
    potentialAction: SCHEMA_FRAGMENTS.searchAction,
    publisher: { '@id': SCHEMA_IDS.organization },
  });
}

/** Build a SoftwareApplication schema with page-specific description */
export function buildSoftwareSchema(description: string) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': SCHEMA_IDS.software,
    name: APP_NAME,
    description,
    url: APP_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: SCHEMA_FRAGMENTS.offers,
    aggregateRating: SCHEMA_FRAGMENTS.aggregateRating,
    author: { '@id': SCHEMA_IDS.organization },
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
    '@id': SCHEMA_IDS.organization,
    name: APP_NAME,
    legalName: overrides.legalName,
    url: APP_URL,
    logo: SCHEMA_FRAGMENTS.logo,
    image: `${APP_URL}/og/default.png`,
    description: overrides.description,
    sameAs: overrides.sameAs,
    contactPoint: SCHEMA_FRAGMENTS.contactPoint,
    foundingDate: '2024',
    additionalType: 'https://schema.org/SoftwareApplication',
    knowsAbout: [
      'Music Technology',
      'Smart Links',
      'Music Marketing',
      'Independent Musicians',
      'Music Distribution',
      'Fan Engagement',
    ],
  });
}

/** Build a FAQPage schema from question/answer pairs */
export function buildFaqSchema(
  items: Array<{ question: string; answer: string }>
) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  });
}

/** Build an Article schema for blog posts */
export function buildArticleSchema(overrides: {
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  authorName: string;
  url: string;
  image?: string;
}) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: overrides.headline,
    description: overrides.description,
    datePublished: overrides.datePublished,
    dateModified: overrides.dateModified ?? overrides.datePublished,
    url: overrides.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': overrides.url },
    author: {
      '@type': 'Person',
      name: overrides.authorName,
    },
    publisher: {
      '@id': SCHEMA_IDS.organization,
    },
    image: overrides.image ?? `${APP_URL}/og/default.png`,
  });
}

/** Build a BreadcrumbList schema */
export function buildBreadcrumbSchema(
  items: Array<{ name: string; url: string }>
) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  });
}
