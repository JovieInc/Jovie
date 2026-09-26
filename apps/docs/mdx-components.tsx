import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs';
import { ArticleDirectory } from '@/components/ArticleDirectory';
import { HelpArticleWrapper } from '@/components/help/HelpArticleWrapper';
import { RelatedGuides } from '@/components/RelatedGuides';

const docsComponents = getDocsMDXComponents();

export function useMDXComponents(components?: Record<string, unknown>) {
  return {
    ...docsComponents,
    wrapper: HelpArticleWrapper,
    ArticleDirectory,
    RelatedGuides,
    ...components,
  };
}
