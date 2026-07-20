import { canonicalizeSurfaceUrl } from '@/lib/profile-surfaces/contracts';
import type { ProfileSearchOrganicResult } from './provider';

export type SearchResultClassification =
  | 'owned'
  | 'aligned'
  | 'qualified'
  | 'conflicting'
  | 'unknown';

export interface ClassifiableSurface {
  readonly id: string;
  readonly kind: string;
  readonly normalizedUrl: string;
  readonly qualificationStatus: string;
}

export interface ClassifiedSearchResult extends ProfileSearchOrganicResult {
  readonly classification: SearchResultClassification;
  readonly surfaceId: string | null;
}

function matchesSurface(
  resultUrl: string,
  surface: ClassifiableSurface
): boolean {
  if (resultUrl === surface.normalizedUrl) return true;
  if (surface.kind !== 'website') return false;

  const result = canonicalizeSurfaceUrl(resultUrl);
  const expected = canonicalizeSurfaceUrl(surface.normalizedUrl);
  return Boolean(result && expected && result.hostname === expected.hostname);
}

export function classifySearchResults(
  results: readonly ProfileSearchOrganicResult[],
  surfaces: readonly ClassifiableSurface[]
): ClassifiedSearchResult[] {
  return results.map(result => {
    const surface = surfaces.find(candidate =>
      matchesSurface(result.normalizedUrl, candidate)
    );
    if (!surface) {
      return { ...result, classification: 'unknown', surfaceId: null };
    }

    let classification: SearchResultClassification;
    if (surface.qualificationStatus === 'conflicting') {
      classification = 'conflicting';
    } else if (surface.qualificationStatus !== 'qualified') {
      classification = 'unknown';
    } else if (surface.kind === 'jovie') {
      classification = 'owned';
    } else if (surface.kind === 'website') {
      classification = 'aligned';
    } else {
      classification = 'qualified';
    }

    return { ...result, classification, surfaceId: surface.id };
  });
}

export function summarizeQualifiedShare(
  results: readonly ClassifiedSearchResult[]
) {
  const counts = {
    owned: 0,
    aligned: 0,
    qualified: 0,
    conflicting: 0,
    unknown: 0,
  };
  for (const result of results) counts[result.classification] += 1;
  const qualifiedCount = counts.owned + counts.aligned + counts.qualified;
  return {
    ...counts,
    qualifiedCount,
    qualifiedShare:
      results.length === 0 ? null : qualifiedCount / results.length,
  };
}
