/**
 * Cross-platform link discovery service
 *
 * Discovers streaming platform links for releases using ISRC lookups.
 * Currently supports:
 * - Apple Music (via iTunes Search API)
 * - Deezer (via public API)
 */

import { lookupAppleMusicByIsrc, lookupDeezerByIsrc } from './provider-links';
import { getTracksForRelease, upsertProviderLink } from './queries';

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
 * Discover cross-platform links for a release using track ISRCs
 *
 * Strategy:
 * 1. Get tracks for the release
 * 2. Find the first track with an ISRC (usually track 1)
 * 3. Look up Apple Music and Deezer using that ISRC
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

  // Apple Music lookup
  if (!skipExisting || !existingSet.has('apple_music')) {
    lookupPromises.push(
      lookupAppleMusicByIsrc(isrc, { storefront })
        .then(async appleResult => {
          if (appleResult) {
            await upsertProviderLink({
              releaseId,
              providerId: 'apple_music',
              url: appleResult.url,
              externalId: appleResult.trackId,
              sourceType: 'ingested',
              metadata: {
                discoveredFrom: 'apple_music_isrc',
                discoveredAt: new Date().toISOString(),
                isrc,
              },
            });

            result.discovered.push({
              provider: 'apple_music',
              url: appleResult.url,
              quality: 'canonical',
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

            await upsertProviderLink({
              releaseId,
              providerId: 'deezer',
              url,
              externalId,
              sourceType: 'ingested',
              metadata: {
                discoveredFrom: 'deezer_isrc',
                discoveredAt: new Date().toISOString(),
                isrc,
                trackUrl: deezerResult.url,
                trackId: deezerResult.trackId,
              },
            });

            result.discovered.push({
              provider: 'deezer',
              url,
              quality: 'canonical',
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

  await Promise.all(lookupPromises);

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
