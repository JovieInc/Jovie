import type { LibraryReleaseAsset } from './library-data';

export function buildLibraryAskJovieDraft(
  asset: LibraryReleaseAsset,
  profileId: string
): string {
  return `Help me with this library item.\n${JSON.stringify({
    kind: asset.itemKind ?? 'release',
    id: asset.id,
    profileId,
    title: asset.title,
    artist: asset.artist,
    source: asset.source ?? null,
    linkedReleaseId: asset.linkedReleaseId ?? null,
    revision: asset.updatedAt ?? null,
  })}`;
}
