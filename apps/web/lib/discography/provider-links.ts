import * as Sentry from '@sentry/nextjs';

import {
  isMusicfetchAvailable,
  lookupByIsrc as musicfetchLookupByIsrc,
} from './musicfetch';
import type { ProviderKey } from './types';

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
  'youtube',
  'soundcloud',
  'deezer',
  'amazon_music',
  'tidal',
  'pandora',
  'napster',
  'audiomack',
  'qobuz',
  'anghami',
  'boomplay',
  'iheartradio',
  'tiktok',
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
    case 'youtube':
      return `https://music.youtube.com/search?q=${query}`;
    case 'soundcloud':
      return `https://soundcloud.com/search?q=${query}`;
    case 'deezer':
      return `https://www.deezer.com/search/${query}`;
    case 'amazon_music':
      return `https://music.amazon.com/search/${query}`;
    case 'tidal':
      return `https://tidal.com/search?q=${query}`;
    case 'pandora':
      return `https://www.pandora.com/search/${query}/tracks`;
    case 'napster':
      return `https://web.napster.com/search?query=${query}`;
    case 'audiomack':
      return `https://audiomack.com/search?q=${query}`;
    case 'qobuz':
      return `https://www.qobuz.com/search?q=${query}`;
    case 'anghami':
      return `https://play.anghami.com/search/${query}`;
    case 'boomplay':
      return `https://www.boomplay.com/search/default/${query}`;
    case 'iheartradio':
      return `https://www.iheart.com/search/?query=${query}`;
    case 'tiktok':
      return `https://www.tiktok.com/search?q=${query}`;
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
    Sentry.addBreadcrumb({
      category: 'discography',
      message: 'Deezer lookup failed',
      level: 'debug',
      data: {
        isrc,
        error: error instanceof Error ? error.message : String(error),
      },
    });
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
    Sentry.addBreadcrumb({
      category: 'discography',
      message: 'Apple Music lookup failed',
      level: 'debug',
      data: {
        isrc,
        storefront,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

function processManualOverrides(
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

async function runIsrcLookups(
  track: TrackDescriptor,
  providers: ProviderKey[],
  seenProviders: Set<ProviderKey>,
  links: ProviderLink[],
  options: { storefront: string; fetcher: typeof fetch }
): Promise<void> {
  if (!track.isrc) return;

  const lookupPromises: Promise<void>[] = [];

  // Apple Music ISRC lookup
  if (providers.includes('apple_music') && !seenProviders.has('apple_music')) {
    lookupPromises.push(
      lookupAppleMusicByIsrc(track.isrc, options).then(result => {
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
      })
    );
  }

  // Deezer ISRC lookup
  if (providers.includes('deezer') && !seenProviders.has('deezer')) {
    lookupPromises.push(
      lookupDeezerByIsrc(track.isrc, options).then(result => {
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

  // Musicfetch ISRC lookup (supplementary — resolves all other DSPs in one call)
  if (isMusicfetchAvailable()) {
    lookupPromises.push(
      musicfetchLookupByIsrc(track.isrc).then(result => {
        if (!result) return;

        for (const [providerKey, url] of Object.entries(result.links)) {
          const key = providerKey as ProviderKey;
          // Only use musicfetch results for providers that are requested
          // AND not already resolved by a custom lookup or manual override
          if (providers.includes(key) && !seenProviders.has(key)) {
            links.push({
              provider: key,
              url,
              quality: 'canonical',
              discovered_from: 'musicfetch_isrc',
            });
            seenProviders.add(key);
          }
        }
      })
    );
  }

  await Promise.all(lookupPromises);
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
  processManualOverrides(options.overrides, links, seenProviders);

  // Run ISRC lookups in parallel for speed
  await runIsrcLookups(track, providers, seenProviders, links, {
    storefront,
    fetcher,
  });

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
