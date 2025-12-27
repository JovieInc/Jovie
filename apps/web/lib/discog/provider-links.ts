import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('ProviderLinks');

export type ProviderKey =
  | 'apple_music'
  | 'spotify'
  | 'youtube_music'
  | 'soundcloud'
  | 'deezer'
  | 'amazon_music'
  | 'tidal';

export type ProviderLinkQuality =
  | 'canonical'
  | 'search_fallback'
  | 'manual_override';

export interface ProviderLink {
  provider: ProviderKey;
  url: string;
  quality: ProviderLinkQuality;
  discovered_from: string;
  provider_id?: string;
}

export interface TrackDescriptor {
  title: string;
  artistName: string;
  isrc?: string | null;
}

export interface ResolveProviderLinksOptions {
  storefront?: string;
  providers?: ProviderKey[];
  overrides?: Partial<
    Record<
      ProviderKey,
      {
        url: string;
        discovered_from?: string;
      }
    >
  >;
  fetcher?: typeof fetch;
}

const DEFAULT_PROVIDERS: ProviderKey[] = [
  'apple_music',
  'spotify',
  'youtube_music',
  'soundcloud',
  'deezer',
  'amazon_music',
  'tidal',
];

const DEFAULT_APPLE_STOREFRONT = 'us';

function buildSearchQuery(track: TrackDescriptor): string {
  const parts = [track.isrc, track.artistName, track.title]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(value => value.trim());

  return encodeURIComponent(parts.join(' '));
}

export function buildSearchUrl(
  provider: ProviderKey,
  track: TrackDescriptor,
  options: { storefront?: string } = {}
): string {
  const query = buildSearchQuery(track);
  const storefront = options.storefront ?? DEFAULT_APPLE_STOREFRONT;

  switch (provider) {
    case 'apple_music':
      return `https://music.apple.com/${storefront}/search?term=${query}`;
    case 'spotify':
      return `https://open.spotify.com/search/${query}`;
    case 'youtube_music':
      return `https://music.youtube.com/search?q=${query}`;
    case 'soundcloud':
      return `https://soundcloud.com/search?q=${query}`;
    case 'deezer':
      return `https://www.deezer.com/search/${query}`;
    case 'amazon_music':
      return `https://music.amazon.com/search/${query}`;
    case 'tidal':
      return `https://tidal.com/search?q=${query}`;
    default:
      return query;
  }
}

export interface AppleMusicLookupResult {
  url: string;
  trackId: string | null;
}

export async function lookupAppleMusicByIsrc(
  isrc: string,
  options: { storefront?: string; fetcher?: typeof fetch } = {}
): Promise<AppleMusicLookupResult | null> {
  const storefront = options.storefront ?? DEFAULT_APPLE_STOREFRONT;
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(
      `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(isrc)}&country=${storefront}&entity=song`
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      resultCount?: number;
      results?: Array<Record<string, unknown>>;
    };

    if (!payload.results || payload.results.length === 0) return null;

    const match = payload.results.find(
      result => typeof result.trackViewUrl === 'string'
    );

    if (!match || typeof match.trackViewUrl !== 'string') return null;

    const rawTrackId = match.trackId;
    const trackId =
      typeof rawTrackId === 'number'
        ? String(rawTrackId)
        : typeof rawTrackId === 'string'
          ? rawTrackId
          : null;

    const canonicalUrl = match.trackViewUrl.replace(
      'itunes.apple.com',
      'music.apple.com'
    );

    return {
      url: canonicalUrl,
      trackId,
    };
  } catch (error) {
    log.debug('Apple Music lookup failed', { error, isrc });
    return null;
  }
}

export async function resolveProviderLinks(
  track: TrackDescriptor,
  options: ResolveProviderLinksOptions = {}
): Promise<ProviderLink[]> {
  const providers = options.providers ?? DEFAULT_PROVIDERS;
  const storefront = options.storefront ?? DEFAULT_APPLE_STOREFRONT;
  const fetcher = options.fetcher ?? fetch;

  const links: ProviderLink[] = [];
  const seenProviders = new Set<ProviderKey>();

  // Manual overrides take precedence
  if (options.overrides) {
    for (const [provider, override] of Object.entries(options.overrides)) {
      if (!override) continue;
      const key = provider as ProviderKey;
      seenProviders.add(key);
      links.push({
        provider: key,
        url: override.url,
        quality: 'manual_override',
        discovered_from: override.discovered_from ?? 'manual_override',
      });
    }
  }

  if (
    track.isrc &&
    providers.includes('apple_music') &&
    !seenProviders.has('apple_music')
  ) {
    const appleMatch = await lookupAppleMusicByIsrc(track.isrc, {
      storefront,
      fetcher,
    });

    if (appleMatch) {
      links.push({
        provider: 'apple_music',
        url: appleMatch.url,
        quality: 'canonical',
        discovered_from: 'apple_music_lookup',
        provider_id: appleMatch.trackId ?? undefined,
      });
      seenProviders.add('apple_music');
    }
  }

  for (const provider of providers) {
    if (seenProviders.has(provider)) continue;

    links.push({
      provider,
      url: buildSearchUrl(provider, track, { storefront }),
      quality: 'search_fallback',
      discovered_from: 'search_url',
    });
    seenProviders.add(provider);
  }

  return links;
}
