import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleMetadataError,
  buildArticleConsumers,
  findAffectedArticles,
  parseFeatureRegistry,
  parseFrontmatter,
  parseProductRoutes,
  validateArticleMetadata,
} from './article-metadata.mjs';
import { filterNavigationPageMap } from './article-registry.mjs';

const registryMarkdown = `
| Feature ID | Product feature |
|---|---|
| public-profile-pages | Public profile pages |
| auto-sync-from-spotify | Auto-sync from Spotify |

| Product area | Feature | Status | Access model | Flag / Gate | Notes |
|---|---|---|---|---|---|
| Profile | Public profile pages | Shipped | Free+ | None | Public route |
| Release Workflows | Auto-sync from Spotify | Shipped | Free+ | None | Import flow |
`;

const routeSource = `
export const APP_ROUTES = {
  START: '/start',
  LIBRARY: '/app/library',
  SETTINGS_ARTIST_PROFILE: '/app/settings/artist-profile',
} as const;
`;

const registries = {
  features: parseFeatureRegistry(registryMarkdown),
  routes: parseProductRoutes(routeSource),
};

const certifiedGuide = {
  id: 'connect-spotify',
  title: 'Connect Spotify to Jovie',
  description: 'Add your Spotify artist account and import your catalog.',
  documentType: 'guide',
  category: 'jovie-essentials',
  productBacked: true,
  featureId: 'auto-sync-from-spotify',
  productRoute: '/app/library',
  status: 'certified',
  lastVerifiedAt: '2026-09-03',
  verifiedBy: 'human',
  keywords: ['connect spotify', 'missing spotify music', 'import catalog'],
  redirectAliases: ['/docs/self-serve-guide/connect-dsps'],
  visualProofRefs: ['proof/connect-spotify-success.png'],
  uiLabels: ['Library', 'Releases', 'Connect Spotify'],
  productSourceRefs: [
    'apps/web/components/features/dashboard/organisms/release-provider-matrix',
  ],
  launchPath: true,
};

test('parses the supported frontmatter contract', () => {
  const parsed = parseFrontmatter(`---
id: connect-spotify
title: Connect Spotify to Jovie
description: Add your Spotify artist account and import your catalog.
documentType: guide
category: jovie-essentials
productBacked: true
featureId: auto-sync-from-spotify
productRoute: /app/library
status: certified
lastVerifiedAt: 2026-09-03
verifiedBy: human
keywords:
  - connect spotify
  - import catalog
redirectAliases: []
visualProofRefs:
  - proof/connect-spotify-success.png
uiLabels:
  - Library
productSourceRefs:
  - apps/web/components/library
launchPath: true
---

# Connect Spotify
`);

  assert.equal(parsed.metadata.id, 'connect-spotify');
  assert.deepEqual(parsed.metadata.keywords, [
    'connect spotify',
    'import catalog',
  ]);
  assert.equal(parsed.metadata.launchPath, true);
});

test('accepts a human-certified launch guide linked to live registries', () => {
  assert.deepEqual(
    validateArticleMetadata(certifiedGuide, registries),
    certifiedGuide
  );
});

test('does not treat an unregistered feature-name slug as a stable ID', () => {
  const withoutStableId = registryMarkdown.replace(
    '| auto-sync-from-spotify | Auto-sync from Spotify |\n',
    ''
  );
  const features = parseFeatureRegistry(withoutStableId);
  assert.equal(features.has('auto-sync-from-spotify'), false);
});

test('reports clear migration errors for title-only legacy frontmatter', () => {
  assert.throws(
    () => validateArticleMetadata({ title: 'Old guide' }, registries),
    error => {
      assert.match(error.message, /article metadata migration failed/);
      assert.match(error.message, /id is required/);
      assert.match(error.message, /description is required/);
      assert.match(error.message, /documentType is required/);
      assert.match(error.message, /status is required/);
      return true;
    }
  );
});

for (const [name, patch, expected] of [
  ['feature', { featureId: 'missing-feature' }, /unknown featureId/],
  ['route', { productRoute: '/app/missing' }, /unknown productRoute/],
  ['status', { status: 'live' }, /invalid status/],
  ['date', { lastVerifiedAt: 'September 3' }, /valid YYYY-MM-DD/],
  ['category', { category: 'setup' }, /invalid category/],
]) {
  test(`rejects a deliberate-red invalid ${name} fixture`, () => {
    assert.throws(
      () =>
        validateArticleMetadata({ ...certifiedGuide, ...patch }, registries),
      expected
    );
  });
}

test('requires human certification and visual proof for launch-path guides', () => {
  assert.throws(
    () =>
      validateArticleMetadata(
        {
          ...certifiedGuide,
          verifiedBy: 'machine',
          visualProofRefs: [],
        },
        registries
      ),
    /launchPath guides require human verification.*visualProofRefs/s
  );
});

test('preserves explicit reference docs without a product capability link', () => {
  const reference = {
    id: 'api-reference',
    title: 'API Reference',
    description: 'Technical reference for the public artist profile API.',
    documentType: 'reference',
    category: 'developers',
    productBacked: false,
    status: 'published',
    lastVerifiedAt: null,
    verifiedBy: 'unverified',
    keywords: ['api', 'openapi', 'profile json'],
    redirectAliases: ['/docs/api-reference'],
    visualProofRefs: [],
    uiLabels: [],
    productSourceRefs: ['apps/web/lib/api/v1/contract.ts'],
    launchPath: false,
  };

  assert.equal(
    validateArticleMetadata(reference, registries).documentType,
    'reference'
  );
});

test('navigation, search, sitemap, and related guides share one policy', () => {
  const draft = {
    ...certifiedGuide,
    id: 'draft-guide',
    status: 'draft',
    lastVerifiedAt: null,
    verifiedBy: 'unverified',
    visualProofRefs: [],
    launchPath: false,
  };
  const stale = { ...draft, id: 'stale-guide', status: 'stale' };
  const retired = { ...draft, id: 'retired-guide', status: 'retired' };
  const uncertified = {
    ...draft,
    id: 'uncertified-guide',
    status: 'uncertified',
  };
  const consumers = buildArticleConsumers([
    certifiedGuide,
    draft,
    stale,
    retired,
    uncertified,
  ]);

  assert.deepEqual(
    consumers.navigation.map(article => article.id),
    ['connect-spotify']
  );
  assert.deepEqual(
    consumers.search.map(article => article.id),
    ['connect-spotify']
  );
  assert.deepEqual(
    consumers.sitemap.map(article => article.id),
    ['connect-spotify']
  );
  assert.deepEqual(
    consumers.related('connect-spotify').map(article => article.id),
    []
  );
});

test('a simulated feature, route, source-label, or certification change identifies the article', () => {
  const nextFeatureRegistry = parseFeatureRegistry(
    registryMarkdown.replace(
      '| Release Workflows | Auto-sync from Spotify | Shipped |',
      '| Release Workflows | Auto-sync from Spotify | In rollout |'
    )
  );
  const nextRouteRegistry = parseProductRoutes(
    routeSource.replace("LIBRARY: '/app/library'", "LIBRARY: '/app/releases'")
  );
  const changedCertification = {
    ...certifiedGuide,
    status: 'stale',
  };

  const affected = findAffectedArticles({
    beforeArticles: [certifiedGuide],
    afterArticles: [changedCertification],
    beforeFeatures: registries.features,
    afterFeatures: nextFeatureRegistry,
    beforeRoutes: registries.routes,
    afterRoutes: nextRouteRegistry,
    changedPaths: [
      'apps/web/components/features/dashboard/organisms/release-provider-matrix/index.tsx',
    ],
  });

  assert.deepEqual(affected, [
    {
      articleId: 'connect-spotify',
      reasons: [
        'certification-state-changed',
        'feature-state-changed:auto-sync-from-spotify',
        'product-route-changed:LIBRARY',
        'product-source-changed:apps/web/components/features/dashboard/organisms/release-provider-matrix',
      ],
      needsRecertification: true,
    },
  ]);
});

test('articleMetadataError keeps source paths in build failures', () => {
  const error = articleMetadataError('app/docs/example/page.mdx', [
    'id is required',
  ]);
  assert.match(error.message, /app\/docs\/example\/page\.mdx/);
});

test('navigation page maps exclude non-primary article routes', () => {
  const pageMap = [
    { name: 'index', route: '/', frontMatter: { status: 'retired' } },
    {
      name: 'docs',
      route: '/docs',
      children: [
        { name: 'index', route: '/docs' },
        { name: 'api-reference', route: '/docs/api-reference' },
        { name: 'old-guide', route: '/docs/old-guide' },
      ],
    },
  ];

  assert.deepEqual(
    filterNavigationPageMap(pageMap, ['/docs', '/docs/api-reference']),
    [
      {
        name: 'docs',
        route: '/docs',
        children: [
          { name: 'index', route: '/docs' },
          { name: 'api-reference', route: '/docs/api-reference' },
        ],
      },
    ]
  );
});
