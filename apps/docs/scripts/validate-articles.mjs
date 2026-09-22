#!/usr/bin/env node

import { loadArticleRegistry } from '../lib/article-registry.mjs';

try {
  const registry = loadArticleRegistry();
  process.stdout.write(
    `${JSON.stringify({
      articles: registry.articles.length,
      primary: registry.consumers.navigation.length,
      certifiedGuides: registry.articles.filter(
        article =>
          article.documentType === 'guide' && article.status === 'certified'
      ).length,
    })}\n`
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
