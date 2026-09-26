import nextra from 'nextra';
import { loadArticleRegistry } from './lib/article-registry.mjs';
import { buildRedirects } from './lib/redirects.mjs';

const withNextra = nextra({});

export default withNextra({
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      'next-mdx-import-source-file': './mdx-components.tsx',
    },
  },
  async redirects() {
    const { articles } = loadArticleRegistry();
    return buildRedirects(articles);
  },
});
