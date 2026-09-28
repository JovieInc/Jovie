import assert from 'node:assert/strict';
import test from 'node:test';
import { loadArticleRegistry } from './article-registry.mjs';
import { HELP_CENTER_DESTINATIONS } from './help-center-home.mjs';
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildDocsIndex,
  buildDocsRedirects,
  buildLlmsTxt,
  buildRobotsConfig,
  buildSitemapEntries,
  canonicalUrl,
  DOCS_ORIGIN,
  HELP_CENTER_HOME_ROUTE,
  LEGACY_REDIRECTS,
  liveCanonicalRoutes,
} from './help-center-seo.mjs';

const registry = loadArticleRegistry();
const primaryRoutes = new Set(
  registry.consumers.navigation.map(article => article.route)
);
const retiredRoutes = registry.articles
  .filter(article => !primaryRoutes.has(article.route))
  .map(article => article.route);

test('every primary document resolves to exactly one canonical URL', () => {
  const canonicals = new Set();
  for (const article of registry.consumers.navigation) {
    const url = canonicalUrl(article.route);
    assert.ok(url.startsWith(`${DOCS_ORIGIN}/`));
    canonicals.add(url);
  }
  assert.equal(canonicals.size, registry.consumers.navigation.length);
});

test('robots config allows crawlers and points at the sitemap', () => {
  const robots = buildRobotsConfig();
  assert.deepEqual(robots.rules, [{ userAgent: '*', allow: '/' }]);
  assert.equal(robots.sitemap, `${DOCS_ORIGIN}/sitemap.xml`);
});

test('sitemap is generated from the certified corpus only', () => {
  const entries = buildSitemapEntries(registry);
  const urls = entries.map(entry => entry.url);
  assert.equal(new Set(urls).size, urls.length);
  for (const entry of entries) {
    assert.ok(entry.url.startsWith(`${DOCS_ORIGIN}/`));
  }
  const sitemapRoutes = new Set(
    urls.map(url => new URL(url).pathname.replace(/\/$/, '') || '/')
  );
  for (const route of primaryRoutes) {
    assert.ok(sitemapRoutes.has(route), `missing primary route ${route}`);
  }
  for (const destination of HELP_CENTER_DESTINATIONS) {
    assert.ok(
      sitemapRoutes.has(destination.route),
      `missing destination ${destination.route}`
    );
  }
  for (const route of retiredRoutes) {
    assert.ok(
      !sitemapRoutes.has(route),
      `non-primary route ${route} leaked into sitemap`
    );
  }
  assert.ok(!sitemapRoutes.has('/'), 'redirected root must not be listed');
  for (const entry of entries) {
    if (entry.lastModified) {
      assert.match(entry.lastModified, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test('redirects are permanent, single-hop, and only target live routes', () => {
  const { redirects, held } = buildDocsRedirects(registry);
  const live = liveCanonicalRoutes(registry);
  const sources = new Set();
  for (const row of redirects) {
    assert.equal(row.permanent, true);
    assert.ok(!sources.has(row.source), `duplicate source ${row.source}`);
    sources.add(row.source);
    assert.ok(
      live.has(row.destination),
      `${row.source} targets non-canonical ${row.destination}`
    );
  }
  for (const row of redirects) {
    assert.ok(
      !sources.has(row.destination),
      `redirect chain through ${row.destination}`
    );
  }
  assert.deepEqual(
    redirects.find(row => row.source === '/'),
    { source: '/', destination: HELP_CENTER_HOME_ROUTE, permanent: true }
  );
  // Every locked migration-map row is either emitted or explicitly held until
  // its canonical destination goes live — nothing is silently dropped.
  const expectedSources = new Set(LEGACY_REDIRECTS.map(row => row.source));
  for (const article of registry.articles) {
    if (!primaryRoutes.has(article.route)) continue;
    for (const alias of article.redirectAliases ?? []) {
      expectedSources.add(alias);
    }
  }
  assert.equal(redirects.length + held.length, expectedSources.size);
});

test('frontmatter redirectAliases extend the redirect set', () => {
  const aliased = {
    ...registry,
    articles: [
      ...registry.articles,
      {
        ...registry.articles.find(
          article => article.route === HELP_CENTER_HOME_ROUTE
        ),
        id: 'alias-fixture',
        route: '/docs/alias-fixture',
        redirectAliases: ['/docs/old-alias'],
      },
    ],
  };
  aliased.consumers = {
    ...registry.consumers,
    sitemap: [
      ...registry.consumers.sitemap,
      aliased.articles[aliased.articles.length - 1],
    ],
  };
  const { redirects } = buildDocsRedirects(aliased);
  assert.deepEqual(
    redirects.find(row => row.source === '/docs/old-alias'),
    {
      source: '/docs/old-alias',
      destination: '/docs/alias-fixture',
      permanent: true,
    }
  );
});

test('llms.txt is generated from the same certified corpus', () => {
  const text = buildLlmsTxt(registry);
  assert.ok(text.startsWith('# Jovie Help Center'));
  for (const article of registry.consumers.navigation) {
    assert.ok(
      text.includes(`](${canonicalUrl(article.route)})`),
      `missing ${article.route}`
    );
  }
  for (const route of retiredRoutes) {
    assert.ok(
      !text.includes(`](${canonicalUrl(route)})`),
      `non-primary route ${route} leaked into llms.txt`
    );
  }
  assert.ok(text.includes('## Developers'));
});

test('docs index carries provenance and product links', () => {
  const index = buildDocsIndex(registry);
  assert.equal(index.origin, DOCS_ORIGIN);
  assert.equal(index.documents.length, registry.consumers.navigation.length);
  for (const doc of index.documents) {
    assert.ok(doc.id);
    assert.ok(doc.canonicalUrl.startsWith(`${DOCS_ORIGIN}/`));
    assert.ok(doc.status);
    assert.ok(Object.hasOwn(doc, 'lastVerifiedAt'));
    assert.ok(Object.hasOwn(doc, 'verifiedBy'));
    const source = registry.consumers.navigation.find(
      article => article.id === doc.id
    );
    if (source.productBacked && typeof source.productRoute === 'string') {
      assert.ok(doc.productUrl.startsWith('https://jov.ie/'));
    } else {
      assert.ok(!('productUrl' in doc));
    }
  }
});

test('article structured data is truthful and category-aware', () => {
  const apiReference = registry.articles.find(
    article => article.id === 'api-reference'
  );
  const jsonLd = buildArticleJsonLd(apiReference);
  assert.equal(jsonLd['@context'], 'https://schema.org');
  const [articleNode, breadcrumb] = jsonLd['@graph'];
  assert.equal(articleNode['@type'], 'TechArticle');
  assert.equal(articleNode.headline, apiReference.title);
  assert.equal(articleNode.url, canonicalUrl(apiReference.route));
  assert.equal(articleNode.isPartOf.url, canonicalUrl(HELP_CENTER_HOME_ROUTE));
  assert.ok(!('FAQPage' in articleNode));
  // lastVerifiedAt is null for unverified published docs — never fabricate it.
  assert.ok(!('dateModified' in articleNode));
  assert.equal(breadcrumb['@type'], 'BreadcrumbList');
  const last = breadcrumb.itemListElement.at(-1);
  assert.equal(last.name, apiReference.title);
  assert.equal(last.item, canonicalUrl(apiReference.route));
});

test('breadcrumbs agree with navigation and sitemap routes', () => {
  for (const article of registry.consumers.navigation) {
    const { '@graph': graph } = buildArticleJsonLd(article);
    const breadcrumb = graph.find(node => node['@type'] === 'BreadcrumbList');
    const items = breadcrumb.itemListElement;
    assert.equal(items[0].item, canonicalUrl(HELP_CENTER_HOME_ROUTE));
    assert.equal(items.at(-1).item, canonicalUrl(article.route));
    items.forEach((item, index) => assert.equal(item.position, index + 1));
  }
  const standalone = buildBreadcrumbJsonLd([
    { name: 'Help Center', route: '/docs' },
    { name: 'Guide', route: '/docs/guide' },
  ]);
  assert.deepEqual(
    standalone.itemListElement.map(item => item.position),
    [1, 2]
  );
});

test('navigation, search, sitemap, and index expose the same documents', () => {
  const nav = registry.consumers.navigation.map(article => article.id).sort();
  const search = registry.consumers.search.map(article => article.id).sort();
  const sitemap = registry.consumers.sitemap.map(article => article.id).sort();
  const index = buildDocsIndex(registry)
    .documents.map(doc => doc.id)
    .sort();
  assert.deepEqual(search, nav);
  assert.deepEqual(sitemap, nav);
  assert.deepEqual(index, nav);
});
