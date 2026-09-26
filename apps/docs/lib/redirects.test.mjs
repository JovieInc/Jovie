import assert from 'node:assert/strict';
import test from 'node:test';
import { loadArticleRegistry } from './article-registry.mjs';
import { buildRedirects } from './redirects.mjs';

// Locked legacy URL table from docs/help-center/MIGRATION_MAP.md (JOV-5893).
// Every migrated URL must resolve to a canonical 200 page or exactly one
// permanent redirect. If a mapped URL loses its target this fixture fails.
const MIGRATED_URLS = [
  ['/', '/docs'],
  ['/docs', '/docs'],
  ['/docs/getting-started', '/docs/jovie-essentials/start-here'],
  ['/docs/features', '/docs/build-your-presence'],
  ['/docs/plans-pricing', '/docs/manage-jovie/plans-and-billing'],
  ['/docs/api-reference', '/docs/developers/api-reference'],
  ['/docs/self-serve-guide', '/docs/jovie-essentials'],
  [
    '/docs/self-serve-guide/claim-handle',
    '/docs/jovie-essentials/find-or-claim-your-profile',
  ],
  [
    '/docs/self-serve-guide/connect-dsps',
    '/docs/jovie-essentials/connect-music-accounts',
  ],
  [
    '/docs/self-serve-guide/set-up-profile',
    '/docs/build-your-presence/profile-and-identity/edit-profile',
  ],
  [
    '/docs/self-serve-guide/share-first-link',
    '/docs/build-your-presence/releases-and-smart-links/add-release-or-smart-link',
  ],
  [
    '/docs/self-serve-guide/set-up-tipping',
    '/docs/build-your-presence/payments-and-support',
  ],
  [
    '/docs/self-serve-guide/set-up-ad-pixels',
    '/docs/manage-jovie/integrations',
  ],
  [
    '/docs/self-serve-guide/connect-bandsintown',
    '/docs/manage-jovie/integrations',
  ],
  ['/docs/features/profile', '/docs/build-your-presence/profile-and-identity'],
  ['/docs/features/profile/tour-dates', '/docs/manage-jovie/integrations'],
  [
    '/docs/features/profile/verified-badge',
    '/docs/build-your-presence/profile-and-identity',
  ],
  [
    '/docs/features/releases',
    '/docs/build-your-presence/releases-and-smart-links',
  ],
  ['/docs/features/audience', '/docs/build-your-presence/audience'],
  ['/docs/features/audience/crm', '/docs/build-your-presence/audience'],
  [
    '/docs/features/analytics',
    '/docs/build-your-presence/insights-and-analytics',
  ],
  [
    '/docs/features/analytics/ai-insights',
    '/docs/build-your-presence/insights-and-analytics',
  ],
  ['/docs/features/analytics/ad-pixels', '/docs/manage-jovie/integrations'],
  ['/docs/features/chat-ai', '/docs/build-your-presence/jovie-assistant'],
  ['/docs/features/tips', '/docs/build-your-presence/payments-and-support'],
  ['/docs/features/retargeting-ads', '/docs/manage-jovie/integrations'],
  ['/getting-started', '/docs/jovie-essentials/start-here'],
];

const registry = loadArticleRegistry();
const canonicalRoutes = new Set(
  registry.consumers.sitemap.map(article => article.route)
);
const redirects = buildRedirects(registry.articles);
const redirectBySource = new Map(
  redirects.map(redirect => [redirect.source, redirect])
);

test('every migrated URL resolves to its locked canonical destination', () => {
  for (const [source, destination] of MIGRATED_URLS) {
    const redirect = redirectBySource.get(source);
    if (source === destination) {
      assert.equal(
        redirect,
        undefined,
        `${source} is canonical and must not redirect`
      );
      assert.equal(
        canonicalRoutes.has(source),
        true,
        `canonical route ${source} is missing from the sitemap`
      );
      continue;
    }
    assert.ok(redirect, `migrated URL ${source} is orphaned`);
    assert.equal(
      redirect.destination,
      destination,
      `${source} must redirect to ${destination}`
    );
    assert.equal(
      redirect.permanent,
      true,
      `${source} must redirect permanently`
    );
    assert.equal(
      canonicalRoutes.has(redirect.destination),
      true,
      `${source} redirects to ${redirect.destination}, which is not a canonical page`
    );
  }
});

test('no redirect chains, loops, or redirects into legacy routes', () => {
  for (const redirect of redirects) {
    assert.equal(
      redirectBySource.has(redirect.destination),
      false,
      `${redirect.source} chains through ${redirect.destination}`
    );
    assert.notEqual(
      redirect.destination,
      redirect.source,
      `${redirect.source} redirects to itself`
    );
  }
});

test('redirect table has no duplicate sources', () => {
  const sources = redirects.map(redirect => redirect.source);
  assert.equal(new Set(sources).size, sources.length);
});

test('every customer-facing category has at least one canonical page', () => {
  const categories = [
    'jovie-essentials',
    'build-your-presence',
    'manage-jovie',
    'developers',
  ];
  for (const category of categories) {
    const routes = registry.articles.filter(
      article =>
        article.category === category && canonicalRoutes.has(article.route)
    );
    assert.ok(
      routes.length > 0,
      `category ${category} would render an empty sidebar section`
    );
    assert.equal(
      canonicalRoutes.has(`/docs/${category}`),
      true,
      `category ${category} is missing its canonical landing page`
    );
  }
});
