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
    .filter((value): value is string => Boolean(value?.trim()))
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

export interface DeezerLookupResult {
  url: string;
  trackId: string;
  albumUrl: string | null;
  albumId: string | null;
}

/**
 * Look up a track on Deezer by ISRC
 * Uses the undocumented but reliable /track/isrc:{ISRC} endpoint
 */
export async function lookupDeezerByIsrc(
  isrc: string,
  options: { fetcher?: typeof fetch } = {}
): Promise<DeezerLookupResult | null> {
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      error?: { type: string; message: string };
      id?: number;
      link?: string;
      album?: {
        id?: number;
        link?: string;
      };
    };

    // Deezer returns error object instead of 404
    if (payload.error || !payload.id || !payload.link) return null;

    return {
      url: payload.link,
      trackId: String(payload.id),
      albumUrl: payload.album?.link ?? null,
      albumId: payload.album?.id ? String(payload.album.id) : null,
    };
  } catch (error) {
    console.debug('Deezer lookup failed', error);
    return null;
  }
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
    let trackId: string | null;
    if (typeof rawTrackId === 'number') {
      trackId = String(rawTrackId);
    } else if (typeof rawTrackId === 'string') {
      trackId = rawTrackId;
    } else {
      trackId = null;
    }

    const canonicalUrl = match.trackViewUrl.replace(
      'itunes.apple.com',
      'music.apple.com'
    );

    return {
      url: canonicalUrl,
      trackId,
    };
  } catch (error) {
    console.debug('Apple Music lookup failed', error);
    return null;
  }
}

function processOverrides(
  overrides: ResolveProviderLinksOptions['overrides'],
  links: ProviderLink[],
  seenProviders: Set<ProviderKey>
): void {
  if (!overrides) return;
  for (const [provider, override] of Object.entries(overrides)) {
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
  processOverrides(options.overrides, links, seenProviders);

  // Run ISRC lookups in parallel for speed
  if (track.isrc) {
    const lookupPromises: Promise<void>[] = [];

    // Apple Music ISRC lookup
    if (
      providers.includes('apple_music') &&
      !seenProviders.has('apple_music')
    ) {
      lookupPromises.push(
        lookupAppleMusicByIsrc(track.isrc, { storefront, fetcher }).then(
          result => {
            if (result) {
              links.push({
                provider: 'apple_music',
                url: result.url,
                quality: 'canonical',
                discovered_from: 'apple_music_isrc',
                provider_id: result.trackId ?? undefined,
              });
              seenProviders.add('apple_music');
            }
          }
        )
      );
    }

    // Deezer ISRC lookup
    if (providers.includes('deezer') && !seenProviders.has('deezer')) {
      lookupPromises.push(
        lookupDeezerByIsrc(track.isrc, { fetcher }).then(result => {
          if (result) {
            // Prefer album URL over track URL for releases
            links.push({
              provider: 'deezer',
              url: result.albumUrl ?? result.url,
              quality: 'canonical',
              discovered_from: 'deezer_isrc',
              provider_id: result.albumId ?? result.trackId,
            });
            seenProviders.add('deezer');
          }
        })
      );
    }

    await Promise.all(lookupPromises);
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
