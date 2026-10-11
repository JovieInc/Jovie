import { isPrimaryArticle } from './article-metadata.mjs';
import {
  HELP_CENTER_DESTINATIONS,
  HELP_CENTER_SUPPORT,
  HELP_CENTER_TITLE,
} from './help-center-home.mjs';
import { HELP_CATEGORIES } from './help-search.mjs';

export const DOCS_ORIGIN = 'https://docs.jov.ie';
export const APP_ORIGIN = 'https://jov.ie';
export const HELP_CENTER_HOME_ROUTE = '/docs';

export const CATEGORY_LABELS = Object.freeze(
  Object.fromEntries(HELP_CATEGORIES.map(({ id, label }) => [id, label]))
);

// Legacy URL → canonical URL contract locked in
// docs/help-center/MIGRATION_MAP.md "Legacy URL to canonical URL redirects".
// The cross-host `support.jov.ie` row is owned by apps/web proxy.ts and is not
// repeated here. Rows are emitted only while their canonical destination is a
// live route so a redirect never lands on a 404.
export const LEGACY_REDIRECTS = Object.freeze([
  { source: '/', destination: HELP_CENTER_HOME_ROUTE },
  {
    source: '/docs/getting-started',
    destination: '/docs/jovie-essentials/start-here',
  },
  { source: '/docs/features', destination: '/docs/build-your-presence' },
  {
    source: '/docs/plans-pricing',
    destination: '/docs/manage-jovie/plans-and-billing',
  },
  {
    source: '/docs/api-reference',
    destination: '/docs/developers/api-reference',
  },
  { source: '/docs/self-serve-guide', destination: '/docs/jovie-essentials' },
  {
    source: '/docs/self-serve-guide/claim-handle',
    destination: '/docs/jovie-essentials/find-or-claim-your-profile',
  },
  {
    source: '/docs/self-serve-guide/connect-dsps',
    destination: '/docs/jovie-essentials/connect-music-accounts',
  },
  {
    source: '/docs/self-serve-guide/set-up-profile',
    destination: '/docs/build-your-presence/profile-and-identity/edit-profile',
  },
  {
    source: '/docs/self-serve-guide/share-first-link',
    destination:
      '/docs/build-your-presence/releases-and-smart-links/add-release-or-smart-link',
  },
  {
    source: '/docs/self-serve-guide/set-up-tipping',
    destination: '/docs/build-your-presence/payments-and-support',
  },
  {
    source: '/docs/self-serve-guide/set-up-ad-pixels',
    destination: '/docs/manage-jovie/integrations',
  },
  {
    source: '/docs/self-serve-guide/connect-bandsintown',
    destination: '/docs/manage-jovie/integrations',
  },
  {
    source: '/docs/features/profile',
    destination: '/docs/build-your-presence/profile-and-identity',
  },
  {
    source: '/docs/features/profile/tour-dates',
    destination: '/docs/manage-jovie/integrations',
  },
  {
    source: '/docs/features/profile/verified-badge',
    destination: '/docs/build-your-presence/profile-and-identity',
  },
  {
    source: '/docs/features/releases',
    destination: '/docs/build-your-presence/releases-and-smart-links',
  },
  {
    source: '/docs/features/audience',
    destination: '/docs/build-your-presence/audience',
  },
  {
    source: '/docs/features/audience/crm',
    destination: '/docs/build-your-presence/audience',
  },
  {
    source: '/docs/features/analytics',
    destination: '/docs/build-your-presence/insights-and-analytics',
  },
  {
    source: '/docs/features/analytics/ai-insights',
    destination: '/docs/build-your-presence/insights-and-analytics',
  },
  {
    source: '/docs/features/analytics/ad-pixels',
    destination: '/docs/manage-jovie/integrations',
  },
  {
    source: '/docs/features/chat-ai',
    destination: '/docs/build-your-presence/jovie-assistant',
  },
  {
    source: '/docs/features/tips',
    destination: '/docs/build-your-presence/payments-and-support',
  },
  {
    source: '/docs/features/retargeting-ads',
    destination: '/docs/manage-jovie/integrations',
  },
  {
    source: '/getting-started',
    destination: '/docs/jovie-essentials/start-here',
  },
]);

// Mirrors apps/web/lib/utils/json-ld.ts; the docs app does not cross app
// boundaries, so the escape stays local.
export function safeJsonLdStringify(data) {
  return JSON.stringify(data)
    .replaceAll('</', String.raw`</`)
    .replaceAll('<!--', String.raw`<!--`);
}

export function canonicalUrl(route) {
  return new URL(route, DOCS_ORIGIN).toString();
}

export function productUrl(productRoute) {
  return new URL(productRoute, APP_ORIGIN).toString();
}

function canonicalRoutes(registry) {
  return new Set([
    ...registry.consumers.sitemap.map(article => article.route),
    ...HELP_CENTER_DESTINATIONS.map(destination => destination.route),
  ]);
}

// A route is "live" when it serves canonical content today: a primary article
// (certified guide or published reference/landing) or a Help Center
// destination. Redirect rows whose canonical target is not live yet are held —
// never emitted — so every shipped redirect is a permanent single hop to a 200.
export function liveCanonicalRoutes(registry) {
  const routes = canonicalRoutes(registry);
  routes.add(HELP_CENTER_HOME_ROUTE);
  return routes;
}

export function buildDocsRedirects(registry) {
  const live = liveCanonicalRoutes(registry);
  const emitted = [];
  const held = [];
  const seenSources = new Map();

  const push = (source, destination) => {
    if (seenSources.has(source)) {
      if (seenSources.get(source) !== destination) {
        throw new Error(`conflicting redirect source: ${source}`);
      }
      return;
    }
    seenSources.set(source, destination);
    const row = { source, destination, permanent: true };
    (live.has(destination) ? emitted : held).push(row);
  };

  for (const { source, destination } of LEGACY_REDIRECTS) {
    push(source, destination);
  }
  for (const article of registry.articles) {
    if (!isPrimaryArticle(article)) continue;
    for (const alias of article.redirectAliases ?? []) {
      if (alias === article.route) {
        throw new Error(
          `redirect alias on ${article.id} points at its own route`
        );
      }
      push(alias, article.route);
    }
  }

  for (const row of emitted) {
    if (seenSources.has(row.destination) && row.destination !== row.source) {
      throw new Error(
        `redirect chain detected: ${row.destination} is itself a redirect source`
      );
    }
  }

  return { redirects: emitted, held };
}

export function buildSitemapEntries(registry) {
  const routes = new Map();
  for (const article of registry.consumers.sitemap) {
    routes.set(article.route, article.lastVerifiedAt ?? undefined);
  }
  for (const destination of HELP_CENTER_DESTINATIONS) {
    if (!routes.has(destination.route))
      routes.set(destination.route, undefined);
  }
  return [...routes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([route, lastVerifiedAt]) => ({
      url: canonicalUrl(route),
      ...(lastVerifiedAt ? { lastModified: lastVerifiedAt } : {}),
    }));
}

export function buildRobotsConfig() {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: canonicalUrl('/sitemap.xml'),
  };
}

export function buildBreadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.route),
    })),
  };
}

const HELP_CENTER_SITE = {
  '@type': 'WebSite',
  name: HELP_CENTER_TITLE,
  url: canonicalUrl(HELP_CENTER_HOME_ROUTE),
};

export function buildArticleJsonLd(article) {
  const articleNode = {
    '@type': article.category === 'developers' ? 'TechArticle' : 'Article',
    headline: article.title,
    description: article.description,
    url: canonicalUrl(article.route),
    mainEntityOfPage: canonicalUrl(article.route),
    inLanguage: 'en',
    isPartOf: HELP_CENTER_SITE,
  };
  if (article.lastVerifiedAt) {
    articleNode.dateModified = article.lastVerifiedAt;
  }
  if (article.productBacked && typeof article.productRoute === 'string') {
    articleNode.relatedLink = [productUrl(article.productRoute)];
  }
  const breadcrumb = [
    { name: HELP_CENTER_TITLE, route: HELP_CENTER_HOME_ROUTE },
  ];
  const destination = HELP_CENTER_DESTINATIONS.find(
    entry => entry.category === article.category
  );
  if (destination && CATEGORY_LABELS[article.category]) {
    breadcrumb.push({
      name: CATEGORY_LABELS[article.category],
      route: destination.route,
    });
  }
  breadcrumb.push({ name: article.title, route: article.route });
  const { '@context': context, ...breadcrumbList } =
    buildBreadcrumbJsonLd(breadcrumb);
  return {
    '@context': context,
    '@graph': [articleNode, breadcrumbList],
  };
}

export function buildDestinationJsonLd(destination) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: destination.title,
        description: destination.description,
        url: canonicalUrl(destination.route),
        inLanguage: 'en',
        isPartOf: HELP_CENTER_SITE,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { name: HELP_CENTER_TITLE, route: HELP_CENTER_HOME_ROUTE },
          { name: destination.title, route: destination.route },
        ].map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: canonicalUrl(item.route),
        })),
      },
    ],
  };
}

function primaryByCategory(registry) {
  const groups = new Map();
  for (const article of registry.consumers.navigation) {
    const key = article.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(article);
  }
  return groups;
}

// llms.txt: compact agent-facing index generated from the same certified
// corpus as navigation, search, and the sitemap. Only primary (certified /
// published) documents are listed; provenance rides on each line.
export function buildLlmsTxt(registry) {
  const groups = primaryByCategory(registry);
  const lines = [
    `# ${HELP_CENTER_TITLE}`,
    '',
    `> ${HELP_CENTER_SUPPORT}`,
    '',
    `Canonical host: ${DOCS_ORIGIN}. Product: ${APP_ORIGIN}.`,
    '',
    '## Help Center',
    '',
    `- [${HELP_CENTER_TITLE}](${canonicalUrl(HELP_CENTER_HOME_ROUTE)}): Help Center home.`,
  ];

  for (const { id, label } of HELP_CATEGORIES) {
    const articles = (groups.get(id) ?? []).filter(
      article => article.route !== HELP_CENTER_HOME_ROUTE
    );
    const destinations = HELP_CENTER_DESTINATIONS.filter(
      destination => destination.category === id
    );
    if (articles.length === 0 && destinations.length === 0) continue;
    lines.push('', `## ${label}`, '');
    for (const destination of destinations) {
      lines.push(
        `- [${destination.title}](${canonicalUrl(destination.route)}): ${destination.description}`
      );
    }
    for (const article of articles) {
      const provenance = article.lastVerifiedAt
        ? ` (verified ${article.lastVerifiedAt} by ${article.verifiedBy})`
        : '';
      const product =
        article.productBacked && typeof article.productRoute === 'string'
          ? ` Product: ${productUrl(article.productRoute)}.`
          : '';
      lines.push(
        `- [${article.title}](${canonicalUrl(article.route)}): ${article.description}${provenance}${product}`
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

// JSON documentation index: one record per primary document carrying the
// provenance and canonical-product-link metadata the human UI does not show.
export function buildDocsIndex(registry) {
  return {
    name: HELP_CENTER_TITLE,
    description: HELP_CENTER_SUPPORT,
    origin: DOCS_ORIGIN,
    documents: registry.consumers.navigation.map(article => ({
      id: article.id,
      title: article.title,
      description: article.description,
      canonicalUrl: canonicalUrl(article.route),
      category: article.category,
      documentType: article.documentType,
      status: article.status,
      lastVerifiedAt: article.lastVerifiedAt,
      verifiedBy: article.verifiedBy,
      keywords: article.keywords,
      ...(article.productBacked && typeof article.productRoute === 'string'
        ? { productUrl: productUrl(article.productRoute) }
        : {}),
    })),
  };
}
