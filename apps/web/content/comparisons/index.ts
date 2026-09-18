import { linkfireComparison } from './linkfire';
import { linktreeComparison } from './linktree';
import type { ComparisonData } from './types';

export type { ComparisonData, ComparisonFaq, ComparisonFeature } from './types';

const comparisons: Record<string, ComparisonData> = {
  linktree: linktreeComparison,
  linkfire: linkfireComparison,
};

export function getComparison(slug: string): ComparisonData | undefined {
  return comparisons[slug];
}

export function getComparisonSlugs(): string[] {
  return Object.keys(comparisons);
}

export function getComparisons(): ComparisonData[] {
  return getComparisonSlugs()
    .map(slug => comparisons[slug])
    .filter((comparison): comparison is ComparisonData => comparison != null);
}
