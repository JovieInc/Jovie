import { resolveLibraryRemovalPolicy } from '@/lib/library/lifecycle-policy';

export type ReleaseSourceType = 'manual' | 'admin' | 'ingested';

/**
 * Provider-ingested, ISRC-bearing, published, or analytics-bearing releases
 * are archive-only. Only a manual never-published release with no durable
 * evidence may be hard-deleted. JOV-3374.
 */
export type ReleaseArchivePolicyInput = {
  readonly status?: string | null;
  readonly sourceType?: string | null;
  readonly releaseDate?: string | Date | null;
  readonly primaryIsrc?: string | null;
  readonly hasAnalytics?: boolean;
};

export function isProviderIngestedSource(
  sourceType: string | null | undefined
): boolean {
  // Only explicit provider/admin origins are archive-only. Missing/manual stay
  // hard-deletable (schema default is `manual`).
  return sourceType === 'ingested' || sourceType === 'admin';
}

export function isReleasePublished(
  release: ReleaseArchivePolicyInput
): boolean {
  if (release.status === 'released') return true;
  if (!release.releaseDate) return false;
  return new Date(release.releaseDate) <= new Date();
}

export function shouldArchiveOnlyRelease(
  release: ReleaseArchivePolicyInput
): boolean {
  const hasBeenPublished = isReleasePublished(release);
  return (
    resolveLibraryRemovalPolicy({
      itemKind: 'release',
      isDraftOrNeverPublished: !hasBeenPublished,
      isIngested: isProviderIngestedSource(release.sourceType),
      hasIsrc: Boolean(release.primaryIsrc?.trim()),
      hasBeenPublished,
      hasAnalytics: release.hasAnalytics,
    }).mode === 'archive'
  );
}

/** Legacy name kept for call-site migration — prefer shouldArchiveOnlyRelease. */
export function isDistributedRelease(
  release: ReleaseArchivePolicyInput
): boolean {
  if (release.sourceType != null) {
    return shouldArchiveOnlyRelease(release);
  }
  // Legacy heuristic when sourceType is not on the view model yet.
  if (!release.primaryIsrc || !release.releaseDate) return false;
  return new Date(release.releaseDate) <= new Date();
}
