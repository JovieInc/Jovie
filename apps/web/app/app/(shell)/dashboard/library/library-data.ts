import type { ReleaseViewModel } from '@/lib/discography/types';

export interface LibraryReleaseAsset {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: string | null;
  readonly releaseType: ReleaseViewModel['releaseType'];
  readonly status: ReleaseViewModel['status'];
  readonly trackCount: number;
  readonly providerCount: number;
  readonly hasLyrics: boolean;
}

export function buildLibraryReleaseAssets(
  releases: readonly ReleaseViewModel[]
): LibraryReleaseAsset[] {
  return releases.map(release => ({
    id: release.id,
    title: release.title,
    artist: release.artistNames?.[0]?.trim() || 'Unknown Artist',
    artworkUrl: release.artworkUrl ?? null,
    releaseDate: release.releaseDate ?? null,
    releaseType: release.releaseType,
    status: release.status,
    trackCount: release.totalTracks,
    providerCount: release.providers.filter(provider => provider.url?.trim())
      .length,
    hasLyrics: Boolean(release.lyrics?.trim()),
  }));
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
