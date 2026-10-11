import {
  isIndexedPageRecord,
  isRoutedPageRecord,
  type PageRecord,
} from '@/data/marketing/factory/pageRecord';
import { solutionsArtistsPage } from './artists';

/** Every /solutions/<audience> record, whatever its ramp state. */
export const SOLUTIONS_PAGE_RECORDS: readonly PageRecord[] = [
  solutionsArtistsPage,
];

export function getRoutedSolutionsPages(
  records: readonly PageRecord[] = SOLUTIONS_PAGE_RECORDS
): readonly PageRecord[] {
  return records.filter(isRoutedPageRecord);
}

export function getIndexedSolutionsPages(
  records: readonly PageRecord[] = SOLUTIONS_PAGE_RECORDS
): readonly PageRecord[] {
  return records.filter(isIndexedPageRecord);
}

/** Routed record for a slug, or null for shadow, pruned, and unknown slugs. */
export function getSolutionsPage(
  slug: string,
  records: readonly PageRecord[] = SOLUTIONS_PAGE_RECORDS
): PageRecord | null {
  return getRoutedSolutionsPages(records).find(r => r.slug === slug) ?? null;
}
