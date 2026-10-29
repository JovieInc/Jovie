/**
 * Onboarding catalog preview (JOV-9758).
 *
 * The onboarding preview must show the artist's real catalog before any
 * pricing step. The confirm-artist tool output carries this small, public
 * snapshot of the matched Spotify artist's newest releases so the preview
 * rail renders the real page (latest release + release list) the moment the
 * artist is picked. The durable import into `discog_releases` runs separately
 * when the profile is materialized.
 *
 * Pure module: shared by the server fetch, the chat tool output and the
 * client rail. Public catalog facts only, never identity or contact data.
 */

import type { PublicRelease } from '@/features/profile/releases/types';

export const ONBOARDING_CATALOG_PREVIEW_LIMIT = 6;

export interface OnboardingCatalogPreviewRelease {
  readonly id: string;
  readonly title: string;
  readonly releaseType: 'album' | 'single' | 'compilation';
  /** ISO date (YYYY, YYYY-MM or YYYY-MM-DD as Spotify reports it). */
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
  readonly spotifyUrl: string;
}

export interface OnboardingCatalogPreview {
  /** Total releases Spotify reports for the artist (albums + singles). */
  readonly total: number;
  /** Newest first, at most ONBOARDING_CATALOG_PREVIEW_LIMIT. */
  readonly releases: readonly OnboardingCatalogPreviewRelease[];
}

export interface CatalogPreviewSourceAlbum {
  readonly id: string;
  readonly name: string;
  readonly album_type: string;
  readonly release_date?: string | null;
  readonly images?: readonly { readonly url: string }[] | null;
  readonly external_urls?: { readonly spotify?: string } | null;
}

const SPOTIFY_ALBUM_URL = /^https:\/\/open\.spotify\.com\/album\/[A-Za-z0-9]+/;
const RELEASE_TYPES = new Set(['album', 'single', 'compilation']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPreviewRelease(
  album: CatalogPreviewSourceAlbum
): OnboardingCatalogPreviewRelease | null {
  const id = album.id?.trim();
  const title = album.name?.trim();
  if (!id || !title) return null;
  const releaseType = RELEASE_TYPES.has(album.album_type)
    ? (album.album_type as OnboardingCatalogPreviewRelease['releaseType'])
    : 'album';
  const artworkUrl = album.images?.[0]?.url ?? null;
  const spotifyUrl =
    album.external_urls?.spotify &&
    SPOTIFY_ALBUM_URL.test(album.external_urls.spotify)
      ? album.external_urls.spotify
      : `https://open.spotify.com/album/${encodeURIComponent(id)}`;
  return {
    id,
    title,
    releaseType,
    releaseDate: album.release_date?.trim() || null,
    artworkUrl: artworkUrl?.startsWith('https://') ? artworkUrl : null,
    spotifyUrl,
  };
}

/** Newest first; undated releases sort last; ties keep source order. */
export function buildOnboardingCatalogPreview(
  albums: readonly CatalogPreviewSourceAlbum[],
  total: number,
  limit: number = ONBOARDING_CATALOG_PREVIEW_LIMIT
): OnboardingCatalogPreview {
  const seen = new Set<string>();
  const releases: OnboardingCatalogPreviewRelease[] = [];
  for (const album of albums) {
    const release = toPreviewRelease(album);
    if (!release || seen.has(release.id)) continue;
    seen.add(release.id);
    releases.push(release);
  }
  const sorted = releases
    .map((release, index) => ({ release, index }))
    .sort((left, right) => {
      const l = left.release.releaseDate ?? '';
      const r = right.release.releaseDate ?? '';
      if (l === r) return left.index - right.index;
      return l < r ? 1 : -1;
    })
    .map(entry => entry.release);
  return {
    total: Math.max(total, releases.length),
    releases: sorted.slice(0, Math.max(0, limit)),
  };
}

/** Runtime guard for tool outputs rehydrated from chat history. */
export function readOnboardingCatalogPreview(
  value: unknown
): OnboardingCatalogPreview | null {
  if (!isRecord(value) || !Array.isArray(value.releases)) return null;
  const releases = value.releases.flatMap(entry => {
    if (!isRecord(entry)) return [];
    const { id, title, releaseType, releaseDate, artworkUrl, spotifyUrl } =
      entry;
    if (typeof id !== 'string' || typeof title !== 'string') return [];
    if (typeof spotifyUrl !== 'string' || !SPOTIFY_ALBUM_URL.test(spotifyUrl))
      return [];
    return [
      {
        id,
        title,
        releaseType:
          typeof releaseType === 'string' && RELEASE_TYPES.has(releaseType)
            ? (releaseType as OnboardingCatalogPreviewRelease['releaseType'])
            : 'album',
        releaseDate: typeof releaseDate === 'string' ? releaseDate : null,
        artworkUrl:
          typeof artworkUrl === 'string' && artworkUrl.startsWith('https://')
            ? artworkUrl
            : null,
        spotifyUrl,
      } satisfies OnboardingCatalogPreviewRelease,
    ];
  });
  const total =
    typeof value.total === 'number' && Number.isFinite(value.total)
      ? Math.max(Math.trunc(value.total), releases.length)
      : releases.length;
  return { total, releases };
}

/**
 * Map the preview to the public profile's release shape so the onboarding
 * rail renders through the same surface as jov.ie/<handle>.
 */
export function toPreviewPublicReleases(
  preview: OnboardingCatalogPreview | null | undefined,
  artistName: string
): PublicRelease[] {
  if (!preview) return [];
  return preview.releases.map(release => ({
    id: `onboarding-release-${release.id}`,
    title: release.title,
    slug: release.id,
    releaseType: release.releaseType,
    releaseDate: release.releaseDate,
    artworkUrl: release.artworkUrl,
    artistNames: [artistName],
  }));
}
