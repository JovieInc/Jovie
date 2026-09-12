import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import type { LibraryPresenceFindingView } from './post-release-types';

export function subjectIdsForAsset(
  asset: LibraryReleaseAsset
): ReadonlySet<string> {
  return new Set(
    [asset.id, asset.source?.canonicalId, asset.linkedReleaseId].filter(
      (value): value is string => Boolean(value)
    )
  );
}

/**
 * JOV-6170 scope integrity: the asset inspector renders only findings scoped
 * to this asset. Artist-scoped recommendations (scope_type='artist', e.g.
 * Genius/Last.fm/MusicBrainz canonical-profile repairs) belong to the
 * Presence surface and never render in a track/release inspector, even when
 * their subject matches. Legacy rows without a scope fall back to subject
 * matching, excluding artist subjects.
 */
export function findingsForAsset(
  asset: LibraryReleaseAsset,
  findings: readonly LibraryPresenceFindingView[]
): LibraryPresenceFindingView[] {
  const subjectIds = subjectIdsForAsset(asset);
  return findings.filter(
    finding =>
      (finding.status === 'open' || finding.status === 'drafted') &&
      finding.scopeType !== 'artist' &&
      (finding.scopeType !== null && finding.scopeId !== null
        ? subjectIds.has(finding.scopeId)
        : finding.subjectType !== 'artist' && subjectIds.has(finding.subjectId))
  );
}
