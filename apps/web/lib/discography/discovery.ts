/**
 * Cross-platform link discovery service
 *
 * Discovers streaming platform links for releases using ISRC lookups.
 * Supports:
 * - Apple Music (via MusicKit API, with iTunes fallback)
 * - Deezer (via public API)
 * - All other DSPs via Musicfetch API (supplementary)
 * - Search URL fallbacks for any DSPs not resolved by the above
 */

import {
  getAlbum,
  isAppleMusicAvailable,
  lookupByIsrc as musicKitLookupByIsrc,
} from '@/lib/dsp-enrichment/providers/apple-music';

import {
  isMusicfetchAvailable,
  lookupByIsrc as musicfetchLookupByIsrc,
} from './musicfetch';
import {
  buildSearchUrl,
  lookupAppleMusicByIsrc,
  lookupDeezerByIsrc,
} from './provider-links';
import {
  getReleaseById,
  getTracksForRelease,
  upsertProviderLink,
} from './queries';
import type { ProviderKey } from './types';

export interface DiscoveryResult {
  releaseId: string;
  discovered: {
    provider: string;
    url: string;
    quality: 'canonical' | 'search_fallback';
  }[];
  errors: string[];
}

export interface DiscoverLinksOptions {
  /** Skip providers that already have links */
  skipExisting?: boolean;
  /** Apple Music storefront code (default: 'us') */
  storefront?: string;
}

/**
 * All DSPs that should receive search URL fallbacks when canonical links
 * cannot be resolved. Spotify is excluded because it's always set during
 * the initial import. bandcamp and beatport are excluded because search
 * URLs are not meaningful for those platforms.
 */
const SEARCH_FALLBACK_PROVIDERS: ProviderKey[] = [
  'apple_music',
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

/**
 * Extract the primary artist name from release metadata.
 * Spotify import stores artist info at metadata.spotifyArtists[0].name.
 */
function extractArtistNameFromMetadata(
  metadata: Record<string, unknown> | undefined | null
): string | null {
  if (!metadata) return null;
  const artists = metadata.spotifyArtists;
  if (!Array.isArray(artists) || artists.length === 0) return null;
  const first = artists[0];
  if (typeof first === 'object' && first !== null && 'name' in first) {
    return typeof first.name === 'string' ? first.name : null;
  }
  return null;
}

/**
 * Derive album URL from a MusicKit song URL when possible.
 */
function deriveAlbumUrl(songUrl: string): string | null {
  if (!songUrl.includes('/album/')) return null;
  try {
    const parsed = new URL(songUrl);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Attempt to resolve the album URL via the album relationship for /song/ URLs.
 */
async function resolveAlbumFromRelationship(
  track: { relationships?: { albums?: { data?: { id: string }[] } } },
  storefront: string
): Promise<string | null> {
  const albumId = track.relationships?.albums?.data?.[0]?.id;
  if (!albumId) return null;
  try {
    const album = await getAlbum(albumId, { storefront });
    return album?.attributes?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up Apple Music URL for a given ISRC, trying MusicKit first then iTunes.
 */
async function lookupAppleMusic(
  isrc: string,
  storefront: string
): Promise<{ url: string; externalId: string | null; source: string } | null> {
  // Try MusicKit API first (officially supports ISRC filtering)
  if (isAppleMusicAvailable()) {
    try {
      const track = await musicKitLookupByIsrc(isrc, { storefront });
      if (track?.attributes?.url) {
        const songUrl = track.attributes.url;
        const albumUrl =
          deriveAlbumUrl(songUrl) ??
          (await resolveAlbumFromRelationship(track, storefront));
        return {
          url: albumUrl ?? songUrl,
          externalId: track.id,
          source: 'musickit_isrc',
        };
      }
    } catch {
      // MusicKit failed, will try iTunes fallback below
    }
  }

  // Fall back to iTunes Search API (undocumented ISRC support)
  try {
    const itunesResult = await lookupAppleMusicByIsrc(isrc, { storefront });
    if (itunesResult) {
      return {
        url: itunesResult.url,
        externalId: itunesResult.trackId,
        source: 'itunes_isrc',
      };
    }
  } catch {
    // Both APIs failed
  }

  return null;
}

/**
 * Save a discovered provider link and record it in the result.
 */
async function saveDiscoveredLink(opts: {
  releaseId: string;
  providerId: string;
  url: string;
  externalId: string | null;
  source: string;
  isrc: string;
  result: DiscoveryResult;
  extraMetadata?: Record<string, unknown>;
}): Promise<void> {
  const {
    releaseId,
    providerId,
    url,
    externalId,
    source,
    isrc,
    result,
    extraMetadata,
  } = opts;
  await upsertProviderLink({
    releaseId,
    providerId,
    url,
    externalId,
    sourceType: 'ingested',
    metadata: {
      discoveredFrom: source,
      discoveredAt: new Date().toISOString(),
      isrc,
      ...extraMetadata,
    },
  });

  result.discovered.push({ provider: providerId, url, quality: 'canonical' });
}

/**
 * Discover cross-platform links for a release using track ISRCs
 *
 * Strategy:
 * 1. Get tracks for the release
 * 2. Find the first track with an ISRC (usually track 1)
 * 3. Look up Apple Music, Deezer, and all other DSPs (via Musicfetch) using that ISRC
 * 4. Save discovered links to the database
 */
export async function discoverLinksForRelease(
  releaseId: string,
  existingProviders: string[] = [],
  options: DiscoverLinksOptions = {}
): Promise<DiscoveryResult> {
  const { skipExisting = true, storefront = 'us' } = options;

  const result: DiscoveryResult = {
    releaseId,
    discovered: [],
    errors: [],
  };

  // Get tracks to find an ISRC
  const tracks = await getTracksForRelease(releaseId);

  if (tracks.length === 0) {
    result.errors.push('No tracks found for release');
    return result;
  }

  // Find the first track with an ISRC (prefer track 1)
  const trackWithIsrc = tracks.find(t => t.isrc) ?? null;

  if (!trackWithIsrc?.isrc) {
    result.errors.push('No ISRC found on any track');
    return result;
  }

  const isrc = trackWithIsrc.isrc;
  const existingSet = new Set(existingProviders);

  // Run lookups in parallel
  const lookupPromises: Promise<void>[] = [];

  // Apple Music lookup — prefer MusicKit API (reliable), fall back to iTunes
  if (!skipExisting || !existingSet.has('apple_music')) {
    lookupPromises.push(
      lookupAppleMusic(isrc, storefront)
        .then(async match => {
          if (match) {
            await saveDiscoveredLink({
              releaseId,
              providerId: 'apple_music',
              url: match.url,
              externalId: match.externalId,
              source: match.source,
              isrc,
              result,
            });
          }
        })
        .catch(error => {
          result.errors.push(
            `Apple Music lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        })
    );
  }

  // Deezer lookup
  if (!skipExisting || !existingSet.has('deezer')) {
    lookupPromises.push(
      lookupDeezerByIsrc(isrc)
        .then(async deezerResult => {
          if (deezerResult) {
            // Prefer album URL over track URL
            const url = deezerResult.albumUrl ?? deezerResult.url;
            const externalId = deezerResult.albumId ?? deezerResult.trackId;

            await saveDiscoveredLink({
              releaseId,
              providerId: 'deezer',
              url,
              externalId,
              source: 'deezer_isrc',
              isrc,
              result,
              extraMetadata: {
                trackUrl: deezerResult.url,
                trackId: deezerResult.trackId,
              },
            });
          }
        })
        .catch(error => {
          result.errors.push(
            `Deezer lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        })
    );
  }

  // Musicfetch lookup (supplementary — resolves all other DSPs in one call)
  if (isMusicfetchAvailable()) {
    lookupPromises.push(
      musicfetchLookupByIsrc(isrc)
        .then(async musicfetchResult => {
          if (!musicfetchResult) return;

          for (const [providerKey, url] of Object.entries(
            musicfetchResult.links
          )) {
            // Skip providers already discovered by custom lookups above
            if (existingSet.has(providerKey)) continue;
            // Skip providers already discovered in this run
            if (result.discovered.some(d => d.provider === providerKey))
              continue;

            await saveDiscoveredLink({
              releaseId,
              providerId: providerKey,
              url,
              externalId: null,
              source: 'musicfetch_isrc',
              isrc,
              result,
            });
          }
        })
        .catch(error => {
          result.errors.push(
            `Musicfetch lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        })
    );
  }

  await Promise.all(lookupPromises);

  // Generate search URL fallbacks for any DSPs not resolved above.
  // This ensures every release gets at least a search link for all supported
  // platforms, even when MusicFetch is unavailable or returns partial results.
  const discoveredProviders = new Set([
    ...existingProviders,
    ...result.discovered.map(d => d.provider),
  ]);

  const undiscovered = SEARCH_FALLBACK_PROVIDERS.filter(
    p => !discoveredProviders.has(p) && (!skipExisting || !existingSet.has(p))
  );

  if (undiscovered.length > 0) {
    const release = await getReleaseById(releaseId);
    const artistName =
      extractArtistNameFromMetadata(release?.metadata ?? null) ?? '';
    const trackTitle = trackWithIsrc.title;

    for (const provider of undiscovered) {
      const searchUrl = buildSearchUrl(
        provider,
        { title: trackTitle, artistName, isrc },
        { storefront }
      );

      await upsertProviderLink({
        releaseId,
        providerId: provider,
        url: searchUrl,
        externalId: null,
        sourceType: 'ingested',
        metadata: {
          discoveredFrom: 'search_fallback',
          discoveredAt: new Date().toISOString(),
          isrc,
        },
      });

      result.discovered.push({
        provider,
        url: searchUrl,
        quality: 'search_fallback',
      });
    }
  }

  return result;
}

/**
 * Discover links for multiple releases
 * Processes sequentially to respect API rate limits
 */
export async function discoverLinksForReleases(
  releases: Array<{
    releaseId: string;
    existingProviders: string[];
  }>,
  options: DiscoverLinksOptions = {}
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];

  for (const release of releases) {
    const result = await discoverLinksForRelease(
      release.releaseId,
      release.existingProviders,
      options
    );
    results.push(result);

    // Small delay between releases to be nice to APIs
    if (releases.indexOf(release) < releases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}
