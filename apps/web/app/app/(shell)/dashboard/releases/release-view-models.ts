import type { ReleaseWithProviders } from '@/lib/discography/queries';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import { VIDEO_PROVIDER_KEYS } from '@/lib/discography/video-providers';
import { mapProviderLinksToViewModel } from '@/lib/discography/view-models';
import { getCanvasStatusFromMetadata } from '@/lib/services/canvas/service';
import { toISOStringOrNull } from '@/lib/utils/date';

type ReleaseStatusValue = 'draft' | 'scheduled' | 'released';

function extractGenres(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];

  const genreField =
    metadata.genres ??
    metadata.genre ??
    metadata.spotifyGenres ??
    metadata.spotify_genres;

  if (Array.isArray(genreField)) {
    return genreField.filter((g): g is string => typeof g === 'string');
  }

  if (typeof genreField === 'string') {
    return [genreField];
  }

  return [];
}

export function mapReleaseToViewModel(
  release: ReleaseWithProviders,
  _providerLabels: Record<ProviderKey, string>,
  profileId: string,
  profileHandle: string
): ReleaseViewModel {
  const slug = release.slug;

  return {
    profileId,
    id: release.id,
    title: release.title,
    artistNames: release.artistNames,
    releaseDate: toISOStringOrNull(release.releaseDate) ?? undefined,
    status: (release.status as ReleaseStatusValue) ?? 'released',
    revealDate: toISOStringOrNull(release.revealDate) ?? undefined,
    deletedAt: toISOStringOrNull(release.deletedAt) ?? undefined,
    artworkUrl: release.artworkUrl ?? undefined,
    slug,
    smartLinkPath: buildSmartLinkPath(profileHandle, slug),
    spotifyPopularity: release.spotifyPopularity,
    providers: mapProviderLinksToViewModel({
      providerLinks: release.providerLinks,
      profileHandle,
      slug,
    }),
    releaseType: release.releaseType,
    isExplicit: release.isExplicit,
    upc: release.upc,
    label: release.label,
    totalTracks: release.totalTracks,
    totalDurationMs: release.trackSummary?.totalDurationMs ?? null,
    primaryIsrc: release.trackSummary?.primaryIsrc ?? null,
    genres:
      release.genres && release.genres.length > 0
        ? release.genres
        : extractGenres(release.metadata),
    targetPlaylists: release.targetPlaylists ?? [],
    copyrightLine: release.copyrightLine ?? null,
    distributor: release.distributor ?? null,
    canvasStatus: getCanvasStatusFromMetadata(release.metadata),
    originalArtworkUrl: (release.metadata as Record<string, unknown> | null)
      ?.originalArtworkUrl as string | undefined,
    hasVideoLinks: release.providerLinks.some(link =>
      (VIDEO_PROVIDER_KEYS as string[]).includes(link.providerId)
    ),
    lyrics:
      (
        release.metadata as Record<string, unknown> | null
      )?.lyrics?.toString() || undefined,
    previewUrl: release.trackSummary?.primaryPreviewUrl || null,
  };
}
