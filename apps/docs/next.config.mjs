import nextra from 'nextra';
import { loadArticleRegistry } from './lib/article-registry.mjs';
import { buildDocsRedirects } from './lib/help-center-seo.mjs';

const withNextra = nextra({});

export default withNextra({
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      'next-mdx-import-source-file': './mdx-components.tsx',
    },
  },
  async redirects() {
    return buildDocsRedirects(loadArticleRegistry()).redirects;
  },
});
