import { APP_NAME, BASE_URL } from '@/constants/app';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

/** Safely serialize JSON-LD with XSS protection */
export const jsonLd = (value: unknown) => safeJsonLdStringify(value);

/** Schema entity IDs for consistent knowledge graph across pages */
export const SCHEMA_IDS = {
  organization: `${BASE_URL}#organization`,
  website: `${BASE_URL}#website`,
  software: `${BASE_URL}#software`,
} as const;

/** Reusable schema fragments shared across marketing pages */
export const SCHEMA_FRAGMENTS = {
  offers: {
    '@type': 'Offer' as const,
    price: '0',
    priceCurrency: 'USD',
    description: 'Free to start',
  },
  // aggregateRating omitted — Google requires genuine user reviews, not hardcoded values
  author: {
    '@type': 'Organization' as const,
    name: APP_NAME,
    url: BASE_URL,
  },
  logo: {
    '@type': 'ImageObject' as const,
    url: `${BASE_URL}/brand/Jovie-Logo-Icon.svg`,
    width: 512,
    height: 512,
  },
  publisher: {
    '@type': 'Organization' as const,
    name: APP_NAME,
    url: BASE_URL,
    logo: {
      '@type': 'ImageObject' as const,
      url: `${BASE_URL}/brand/Jovie-Logo-Icon.svg`,
      width: 512,
      height: 512,
    },
  },
  searchAction: {
    '@type': 'SearchAction' as const,
    target: {
      '@type': 'EntryPoint' as const,
      urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  contactPoint: {
    '@type': 'ContactPoint' as const,
    contactType: 'customer support',
    url: `${BASE_URL}/support`,
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
    url: BASE_URL,
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
    url: BASE_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: SCHEMA_FRAGMENTS.offers,
    // aggregateRating intentionally omitted — no verified user reviews yet
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
    url: BASE_URL,
    logo: SCHEMA_FRAGMENTS.logo,
    image: `${BASE_URL}/og/default.png`,
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
  authorUrl?: string;
  authorImageUrl?: string;
  url: string;
  image?: string;
  keywords?: string[];
  wordCount?: number;
}) {
  const author: {
    '@type': 'Person';
    name: string;
    url?: string;
    image?: string;
  } = {
    '@type': 'Person',
    name: overrides.authorName,
    ...(overrides.authorUrl && { url: overrides.authorUrl }),
    ...(overrides.authorImageUrl && { image: overrides.authorImageUrl }),
  };

  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: overrides.headline,
    description: overrides.description,
    datePublished: overrides.datePublished,
    dateModified: overrides.dateModified ?? overrides.datePublished,
    url: overrides.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': overrides.url },
    author,
    publisher: {
      '@id': SCHEMA_IDS.organization,
    },
    image: overrides.image ?? `${BASE_URL}/og/default.png`,
    ...(overrides.keywords?.length
      ? { keywords: overrides.keywords.join(', ') }
      : {}),
    ...(overrides.wordCount ? { wordCount: overrides.wordCount } : {}),
  });
}

/** Build a Person schema for author pages */
export function buildPersonSchema(overrides: {
  name: string;
  url: string;
  image?: string;
  description?: string;
  sameAs?: string[];
}) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: overrides.name,
    url: overrides.url,
    ...(overrides.image ? { image: overrides.image } : {}),
    ...(overrides.description ? { description: overrides.description } : {}),
    ...(overrides.sameAs?.length ? { sameAs: overrides.sameAs } : {}),
  });
}

/**
 * Build ListenAction entries for provider links.
 * Shared across release and track pages to avoid duplication.
 */
const LISTEN_ACTION_PRIORITY: readonly string[] = [
  'spotify',
  'apple_music',
  'youtube',
  'soundcloud',
  'deezer',
  'tidal',
];

export function buildListenActions(
  providerLinks: Array<{ providerId: string; url: string }>,
  providerLabels?: Record<string, { label: string }>
): Array<Record<string, unknown>> {
  return [...providerLinks]
    .filter(link => link.url)
    .sort((a, b) => {
      const ai = LISTEN_ACTION_PRIORITY.indexOf(a.providerId);
      const bi = LISTEN_ACTION_PRIORITY.indexOf(b.providerId);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .slice(0, 5)
    .map(link => ({
      '@type': 'ListenAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: link.url,
        actionPlatform: 'https://schema.org/DesktopWebPlatform',
      },
      ...(providerLabels?.[link.providerId]?.label && {
        name: `Listen on ${providerLabels[link.providerId].label}`,
      }),
    }));
}

/** Build a raw BreadcrumbList object (for embedding in @graph arrays) */
export function buildBreadcrumbObject(
  items: Array<{ name: string; url: string }>
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
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
