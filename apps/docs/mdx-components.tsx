import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs';
import type { ComponentProps } from 'react';
import { ArticleDirectory } from '@/components/ArticleDirectory';
import { HelpCenterHome } from '@/components/HelpCenterHome';
import { RelatedGuides } from '@/components/RelatedGuides';
import { isPrimaryArticle } from '@/lib/article-metadata.mjs';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';
import {
  buildArticleJsonLd,
  canonicalUrl,
  safeJsonLdStringify,
} from '@/lib/help-center-seo.mjs';

const docsComponents = getDocsMDXComponents();
const DocsWrapper = docsComponents.wrapper;

let cachedRegistry: ReturnType<typeof loadArticleRegistry> | null = null;

function registry() {
  if (!cachedRegistry) cachedRegistry = loadArticleRegistry();
  return cachedRegistry;
}

type RegistryArticle = { id?: string; route: string };

function ArticleSeo({ id }: { id: string }) {
  const article = (registry().articles as RegistryArticle[]).find(
    entry => entry.id === id
  );
  if (!article) return null;
  if (!isPrimaryArticle(article)) {
    // Draft, uncertified, stale, retired, and legacy pages stay out of the
    // index even while they remain routable during the migration.
    return <meta name='robots' content='noindex' />;
  }
  return (
    <>
      <link rel='canonical' href={canonicalUrl(article.route)} />
      <script type='application/ld+json'>
        {safeJsonLdStringify(buildArticleJsonLd(article))}
      </script>
    </>
  );
}

function HelpCenterArticle(
  props: ComponentProps<NonNullable<typeof DocsWrapper>>
) {
  if (!DocsWrapper) return props.children;
  const metadata = props.metadata as typeof props.metadata & {
    readonly id?: string;
    readonly category?: string;
    readonly documentType?: string;
    readonly redirectAliases?: readonly string[];
    readonly searchable?: boolean;
  };
  const searchTerms = [
    metadata.description,
    ...(Array.isArray(metadata.keywords) ? metadata.keywords : []),
    ...(Array.isArray(metadata.redirectAliases)
      ? metadata.redirectAliases
      : []),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <DocsWrapper {...props}>
      {typeof metadata.id === 'string' && <ArticleSeo id={metadata.id} />}
      {props.children}
      {metadata.searchable !== false && (
        <span className='help-search-index-metadata' aria-hidden='true'>
          <span data-pagefind-meta='category'>{metadata.category}</span>
          <span data-pagefind-meta='contentType'>{metadata.documentType}</span>
          <span data-pagefind-meta='description'>{metadata.description}</span>
          <span data-pagefind-weight='5'>{searchTerms}</span>
        </span>
      )}
    </DocsWrapper>
  );
}

export function useMDXComponents(components?: Record<string, unknown>) {
  return {
    ...docsComponents,
    wrapper: HelpCenterArticle,
    ArticleDirectory,
    HelpCenterHome,
    RelatedGuides,
    ...components,
  };
}
