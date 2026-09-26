import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs';
import { ArticleDirectory } from '@/components/ArticleDirectory';
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

export function useMDXComponents(components?: Record<string, unknown>) {
  return {
    ...docsComponents,
    ArticleDirectory,
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
