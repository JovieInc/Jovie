export type ReleaseSourceType = 'manual' | 'admin' | 'ingested';

/**
 * Provider-ingested (or admin-seeded) releases that are already out are
 * archive-only: soft-hide via deleted_at. Jovie-created / manual drafts may
 * be hard-deleted. JOV-3885.
 */
export type ReleaseArchivePolicyInput = {
  readonly status?: string | null;
  readonly sourceType?: string | null;
  readonly releaseDate?: string | Date | null;
  readonly primaryIsrc?: string | null;
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
  return (
    isProviderIngestedSource(release.sourceType) && isReleasePublished(release)
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
