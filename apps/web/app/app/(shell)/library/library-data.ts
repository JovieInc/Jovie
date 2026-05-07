import type { ReleaseViewModel } from '@/lib/discography/types';

export interface LibraryProviderLink {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

export interface LibraryReleaseAsset {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
  readonly smartLinkPath: string;
  readonly releaseDate: string | null;
  readonly releaseType: ReleaseViewModel['releaseType'];
  readonly status: ReleaseViewModel['status'];
  readonly trackCount: number;
  readonly providerCount: number;
  readonly providers: readonly LibraryProviderLink[];
  readonly hasLyrics: boolean;
  readonly hasArtwork: boolean;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function buildLibraryReleaseAssets(
  releases: readonly ReleaseViewModel[]
): LibraryReleaseAsset[] {
  return releases.map(release => {
    const providers = release.providers.flatMap(provider => {
      const url = normalizeHttpUrl(provider.url);
      if (!url) return [];

      return [
        {
          key: provider.key,
          label: provider.label,
          url,
        },
      ];
    });
    const artworkUrl = normalizeHttpUrl(release.artworkUrl);
    const previewUrl = normalizeHttpUrl(release.previewUrl);

    return {
      id: release.id,
      title: release.title,
      artist: release.artistNames?.[0]?.trim() || 'Unknown Artist',
      artworkUrl,
      previewUrl,
      smartLinkPath: release.smartLinkPath,
      releaseDate: release.releaseDate ?? null,
      releaseType: release.releaseType,
      status: release.status,
      trackCount: release.totalTracks,
      providerCount: providers.length,
      providers,
      hasLyrics: Boolean(release.lyrics?.trim()),
      hasArtwork: Boolean(artworkUrl),
    };
  });
}

export function formatLibraryReleaseDate(value: string | null): string {
  if (!value) return 'No Release Date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No Release Date';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
