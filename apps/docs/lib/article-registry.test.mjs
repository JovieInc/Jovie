import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  loadArticleRegistry,
  routeFromArticlePath,
} from './article-registry.mjs';

const featureRegistry = `
| Feature ID | Product feature |
|---|---|
| public-profile-pages | Public profile pages |

| Product area | Feature | Status | Access model | Flag / Gate | Notes |
|---|---|---|---|---|---|
| Profile | Public profile pages | Shipped | Free+ | None | Public route |
`;

const routeRegistry = `
export const APP_ROUTES = {
  START: '/start',
} as const;
`;

function articleFrontmatter({ id, title, documentType, status, searchable }) {
  return `---
id: ${id}
title: ${title}
description: This fixture has enough detail to satisfy the concise description contract.
documentType: ${documentType}
category: ${documentType === 'legacy' ? 'legacy' : 'jovie-essentials'}
productBacked: false
status: ${status}
lastVerifiedAt: null
verifiedBy: unverified
keywords:
  - fixture
redirectAliases: []
visualProofRefs: []
uiLabels: []
productSourceRefs: []
launchPath: false
${searchable === false ? 'searchable: false\n' : ''}---

# ${title}
`;
}

test('loads nested MDX once and derives every primary consumer', t => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'jovie-articles-'));
  t.after(() => rmSync(repositoryRoot, { recursive: true, force: true }));
  const articleDirectory = join(repositoryRoot, 'apps/docs/app');
  const docsDirectory = join(articleDirectory, 'docs');
  const legacyDirectory = join(docsDirectory, 'legacy');
  mkdirSync(legacyDirectory, { recursive: true });
  mkdirSync(join(repositoryRoot, 'docs'), { recursive: true });
  mkdirSync(join(repositoryRoot, 'apps/web/constants'), { recursive: true });
  writeFileSync(
    join(repositoryRoot, 'docs/FEATURE_REGISTRY.md'),
    featureRegistry
  );
  writeFileSync(
    join(repositoryRoot, 'apps/web/constants/routes.ts'),
    routeRegistry
  );
  writeFileSync(
    join(docsDirectory, 'page.mdx'),
    articleFrontmatter({
      id: 'docs-home',
      title: 'Docs',
      documentType: 'landing',
      status: 'published',
    })
  );
  writeFileSync(
    join(legacyDirectory, 'page.mdx'),
    articleFrontmatter({
      id: 'legacy-guide',
      title: 'Old Guide',
      documentType: 'legacy',
      status: 'retired',
      searchable: false,
    })
  );

  const registry = loadArticleRegistry({ repositoryRoot, articleDirectory });
  assert.equal(registry.articles.length, 2);
  assert.deepEqual(
    registry.consumers.navigation.map(article => article.id),
    ['docs-home']
  );
  assert.deepEqual(
    registry.consumers.search.map(article => article.id),
    ['docs-home']
  );
  assert.deepEqual(
    registry.consumers.sitemap.map(article => article.id),
    ['docs-home']
  );
  assert.equal(
    routeFromArticlePath(join(legacyDirectory, 'page.mdx'), articleDirectory),
    '/docs/legacy'
  );
});
