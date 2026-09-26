import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs';
import { ArticleDirectory } from '@/components/ArticleDirectory';
import { HelpCenterHome } from '@/components/HelpCenterHome';
import { RelatedGuides } from '@/components/RelatedGuides';

const docsComponents = getDocsMDXComponents();

export function useMDXComponents(components?: Record<string, unknown>) {
  return {
    ...docsComponents,
    ArticleDirectory,
    HelpCenterHome,
    RelatedGuides,
    ...components,
  };
}
