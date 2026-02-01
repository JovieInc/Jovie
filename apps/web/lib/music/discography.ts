import { DSPS } from '@/constants/app';

export type DSPProviderKey = keyof typeof DSPS | 'youtube_music';

export type SmartLinkSource = 'canonical' | 'search' | 'inferred';

export interface DSPLink {
  provider: DSPProviderKey;
  url: string;
  source: SmartLinkSource;
  confidence: number;
  isrc?: string | null;
  upc?: string | null;
}

export interface DiscographyTrack {
  id: string;
  name: string;
  spotifyId?: string;
  isrc?: string | null;
  durationMs?: number;
  discNumber?: number;
  trackNumber?: number;
  explicit?: boolean;
  dspLinks: DSPLink[];
}

export interface DiscographyRelease {
  id: string;
  name: string;
  albumType: string;
  releaseDate?: string;
  spotifyId?: string;
  upc?: string | null;
  tracks: DiscographyTrack[];
  dspLinks: DSPLink[];
}

export interface SpotifyAPITrack {
  id: string;
  name: string;
  duration_ms?: number;
  disc_number?: number;
  track_number?: number;
  explicit?: boolean;
  external_ids?: {
    isrc?: string;
  };
  external_urls?: {
    spotify?: string;
  };
}

export interface SpotifyAPIAlbum {
  id: string;
  name: string;
  album_type: string;
  release_date?: string;
  external_ids?: {
    upc?: string;
  };
  external_urls?: {
    spotify?: string;
  };
  tracks?: {
    items: SpotifyAPITrack[];
  };
}

const SOURCE_PRIORITY: Record<SmartLinkSource, number> = {
  canonical: 3,
  search: 2,
  inferred: 1,
};

const PROVIDER_PRIORITY: DSPProviderKey[] = [
  'spotify',
  'apple_music',
  'youtube',
  'youtube_music',
  'soundcloud',
  'deezer',
  'tidal',
  'amazon_music',
  'bandcamp',
  'pandora',
  'napster',
  'iheartradio',
];

const buildSpotifyAlbumUrl = (albumId: string): string =>
  `https://open.spotify.com/album/${albumId}`;

const buildSpotifyTrackUrl = (trackId: string): string =>
  `https://open.spotify.com/track/${trackId}`;

const getProviderPriority = (provider: DSPProviderKey): number => {
  const index = PROVIDER_PRIORITY.indexOf(provider);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const isBetterLink = (candidate: DSPLink, current: DSPLink): boolean => {
  if (candidate.provider !== current.provider) return false;

  const sourceDelta =
    SOURCE_PRIORITY[candidate.source] - SOURCE_PRIORITY[current.source];
  if (sourceDelta !== 0) {
    return sourceDelta > 0;
  }

  if ((candidate.isrc && !current.isrc) || (candidate.upc && !current.upc)) {
    return true;
  }

  if (!candidate.confidence && current.confidence) return false;
  if (candidate.confidence && !current.confidence) return true;

  return candidate.confidence > current.confidence;
};

export const DEFAULT_SMART_LISTEN_PREFERENCE: DSPProviderKey[] = [
  'spotify',
  'apple_music',
  'youtube',
  'youtube_music',
  'soundcloud',
  'deezer',
  'tidal',
  'amazon_music',
  'bandcamp',
];

export function mergeDSPLinks(
  ...linkSets: readonly (readonly DSPLink[])[]
): DSPLink[] {
  const bestByProvider = new Map<DSPProviderKey, DSPLink>();

  linkSets.flat().forEach(link => {
    const existing = bestByProvider.get(link.provider);
    if (!existing || isBetterLink(link, existing)) {
      bestByProvider.set(link.provider, link);
    }
  });

  return Array.from(bestByProvider.values()).sort((a, b) => {
    const providerOrder =
      getProviderPriority(a.provider) - getProviderPriority(b.provider);
    if (providerOrder !== 0) return providerOrder;

    const sourceOrder = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
    if (sourceOrder !== 0) return sourceOrder;

    return b.confidence - a.confidence;
  });
}

export function pickSmartListenLink(
  links: DSPLink[],
  preference: DSPProviderKey[] = DEFAULT_SMART_LISTEN_PREFERENCE
): DSPLink | null {
  const deduped = mergeDSPLinks(links);
  if (deduped.length === 0) return null;

  for (const provider of preference) {
    const match = deduped.find(link => link.provider === provider);
    if (match) return match;
  }

  return deduped[0];
}

export function buildSmartListenUrl(
  username: string,
  code: string,
  providerKey?: DSPProviderKey
): string {
  const safeUsername = username.replace(/^\//, '');
  const base = `/${encodeURIComponent(safeUsername)}/listen/${encodeURIComponent(code)}`;
  if (!providerKey) return base;

  return `${base}?p=${encodeURIComponent(providerKey)}`;
}

export function mapSpotifyAlbumToDiscographyRelease(
  album: SpotifyAPIAlbum
): DiscographyRelease {
  const releaseLink: DSPLink = {
    provider: 'spotify',
    url: album.external_urls?.spotify ?? buildSpotifyAlbumUrl(album.id),
    source: 'canonical',
    confidence: 0.99,
    upc: album.external_ids?.upc ?? null,
  };

  const tracks: DiscographyTrack[] = (album.tracks?.items ?? []).map(track => ({
    id: track.id,
    name: track.name,
    spotifyId: track.id,
    isrc: track.external_ids?.isrc ?? null,
    durationMs: track.duration_ms,
    discNumber: track.disc_number,
    trackNumber: track.track_number,
    explicit: track.explicit,
    dspLinks: [
      {
        provider: 'spotify',
        url: track.external_urls?.spotify ?? buildSpotifyTrackUrl(track.id),
        source: 'canonical',
        confidence: 0.99,
        isrc: track.external_ids?.isrc ?? null,
      },
    ],
  }));

  return {
    id: album.id,
    name: album.name,
    albumType: album.album_type,
    releaseDate: album.release_date,
    spotifyId: album.id,
    upc: album.external_ids?.upc ?? null,
    tracks,
    dspLinks: [releaseLink],
  };
}
