import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs';
import type { ComponentProps } from 'react';
import { ArticleDirectory } from '@/components/ArticleDirectory';
import { HelpCenterHome } from '@/components/HelpCenterHome';
import {
  HelpArticle,
  HelpCallout,
  HelpContactPanel,
  HelpFeedback,
  HelpOutcome,
  HelpPrerequisites,
  HelpRelatedGuides,
  HelpScreenshot,
  HelpStep,
  HelpSteps,
  HelpTroubleshooting,
  HelpVideo,
} from '@/components/help';
import { RelatedGuides } from '@/components/RelatedGuides';

const docsComponents = getDocsMDXComponents();
const DocsWrapper = docsComponents.wrapper;

function HelpCenterArticle(
  props: ComponentProps<NonNullable<typeof DocsWrapper>>
) {
  if (!DocsWrapper) return props.children;
  const metadata = props.metadata as typeof props.metadata & {
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
    HelpArticle,
    HelpCallout,
    HelpContactPanel,
    HelpFeedback,
    HelpOutcome,
    HelpPrerequisites,
    HelpRelatedGuides,
    HelpScreenshot,
    HelpStep,
    HelpSteps,
    HelpTroubleshooting,
    HelpVideo,
    ...components,
  };
}
