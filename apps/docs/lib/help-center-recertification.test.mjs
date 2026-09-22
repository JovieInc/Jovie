import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecertificationIssue,
  evaluateRevisionChange,
  syncRecertificationIssues,
} from '../../../scripts/help-center-recertification.mjs';

const article = {
  id: 'connect-spotify',
  title: 'Connect Spotify to Jovie',
  status: 'certified',
};

const affected = {
  articleId: article.id,
  reasons: [
    'product-route-changed:LIBRARY',
    'feature-state-changed:auto-sync-from-spotify',
  ],
  needsRecertification: true,
};

test('builds a stable per-article documentation-review issue', () => {
  const issue = buildRecertificationIssue({
    article,
    affected,
    base: 'base-sha',
    head: 'head-sha',
  });
  assert.equal(issue.fingerprint, 'docs-recert:connect-spotify');
  assert.match(issue.title, /^\[docs-recert:connect-spotify\]/);
  assert.match(issue.description, /base-sha\.\.head-sha/);
  assert.match(issue.description, /V1 launch-path guides require a human/);
});

test('syncs only articles that need recertification in stable order', async () => {
  const calls = [];
  const result = await syncRecertificationIssues({
    affected: [
      { ...affected, articleId: 'draft', needsRecertification: false },
      affected,
    ],
    articles: [article, { ...article, id: 'draft', status: 'draft' }],
    base: 'base-sha',
    head: 'head-sha',
    apiKey: 'test-key',
    upsert: async input => {
      calls.push(input);
      return { ok: true, action: 'created', identifier: 'JOV-9999' };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].fingerprint, 'docs-recert:connect-spotify');
  assert.equal(calls[0].createStateName, 'Todo');
  assert.deepEqual(result, [
    {
      articleId: 'connect-spotify',
      ok: true,
      action: 'created',
      identifier: 'JOV-9999',
    },
  ]);
});

test('evaluates exact Git revisions without a time-based sweep', () => {
  const featureRegistry = `
| Feature ID | Product feature |
|---|---|
| auto-sync-from-spotify | Auto-sync from Spotify |

| Product area | Feature | Status | Access model | Flag / Gate | Notes |
|---|---|---|---|---|---|
| Release Workflows | Auto-sync from Spotify | Shipped | Free+ | None | Import flow |
`;
  const routeRegistry = `
export const APP_ROUTES = {
  LIBRARY: '/app/library',
} as const;
`;
  const changedRouteRegistry = routeRegistry.replace(
    '/app/library',
    '/app/releases'
  );
  const renderArticle = status => `---
id: connect-spotify
title: Connect Spotify to Jovie
description: Add your Spotify artist account and import your catalog.
documentType: guide
category: jovie-essentials
productBacked: true
featureId: auto-sync-from-spotify
productRoute: /app/library
status: ${status}
lastVerifiedAt: 2026-09-03
verifiedBy: human
keywords:
  - connect spotify
redirectAliases: []
visualProofRefs:
  - proof/connect.png
uiLabels:
  - Connect Spotify
productSourceRefs:
  - apps/web/components/library
launchPath: true
---
`;
  const outputs = new Map([
    ['show base:docs/FEATURE_REGISTRY.md', featureRegistry],
    ['show head:docs/FEATURE_REGISTRY.md', featureRegistry],
    ['show base:apps/web/constants/routes.ts', routeRegistry],
    ['show head:apps/web/constants/routes.ts', changedRouteRegistry],
    [
      'ls-tree -r --name-only base -- apps/docs/app',
      'apps/docs/app/docs/connect/page.mdx\n',
    ],
    [
      'ls-tree -r --name-only head -- apps/docs/app',
      'apps/docs/app/docs/connect/page.mdx\n',
    ],
    [
      'show base:apps/docs/app/docs/connect/page.mdx',
      renderArticle('certified'),
    ],
    ['show head:apps/docs/app/docs/connect/page.mdx', renderArticle('stale')],
    ['diff --name-only base head', 'apps/docs/app/docs/connect/page.mdx\n'],
  ]);
  const gitImpl = args => {
    const key = args.join(' ');
    assert.equal(outputs.has(key), true, `unexpected git call: ${key}`);
    return outputs.get(key);
  };

  const evaluation = evaluateRevisionChange({
    base: 'base',
    head: 'head',
    gitImpl,
  });
  assert.deepEqual(evaluation.affected, [
    {
      articleId: 'connect-spotify',
      reasons: ['certification-state-changed', 'product-route-changed:LIBRARY'],
      needsRecertification: true,
    },
  ]);
});
