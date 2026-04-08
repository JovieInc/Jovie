import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { cacheQuery } from '@/lib/db/cache';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import {
  getSpotifyArtist,
  isSpotifyAvailable,
  searchSpotifyArtists,
} from '@/lib/spotify/client';
import type { SanitizedArtist } from '@/lib/spotify/sanitize';
import {
  type AlgorithmHealthReport,
  generateHealthReport,
  generateUnavailableHealthReport,
  isSpotifyErrorPageHtml,
} from '@/lib/spotify/scoring';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

class FalUnavailableError extends Error {
  constructor(readonly report: AlgorithmHealthReport) {
    super('FAL data unavailable');
    this.name = 'FalUnavailableError';
  }
}

/**
 * GET /api/spotify/fal-analysis?artistId={id}
 *
 * Fetches the target artist, scrapes their "Fans Also Like" section
 * from the Spotify profile page, resolves each FAL artist via search,
 * and returns a scored health report.
 *
 * Admin-only endpoint.
 */
export async function GET(request: NextRequest) {
  // Auth check
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate input
  const artistId = request.nextUrl.searchParams.get('artistId');
  if (!artistId) {
    return NextResponse.json(
      { error: 'Missing artistId parameter' },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9]{22}$/.test(artistId)) {
    return NextResponse.json(
      { error: 'Invalid Spotify artist ID format' },
      { status: 400 }
    );
  }

  if (!isSpotifyAvailable()) {
    return NextResponse.json(
      { error: 'Spotify integration not configured' },
      { status: 503 }
    );
  }

  try {
    const report = await cacheQuery(
      `fal-analysis:${artistId}`,
      async () => {
        const checkedAt = new Date().toISOString();

        // 1. Fetch target artist
        const targetArtist = await getSpotifyArtist(artistId);
        if (!targetArtist) {
          throw new Error('Artist not found');
        }

        // 2. Scrape FAL names from Spotify profile page
        const falResult = await scrapeFansAlsoLike(artistId);

        if (falResult.status === 'unavailable') {
          throw new FalUnavailableError(
            generateUnavailableHealthReport(targetArtist, {
              checkedAt,
              attemptedNeighbourCount: 0,
              warnings: falResult.warnings,
              detail: falResult.detail,
            })
          );
        }

        const falNames = falResult.names;

        if (falNames.length === 0) {
          return generateHealthReport(targetArtist, [], {
            checkedAt,
            attemptedNeighbourCount: 0,
          });
        }

        // 3. Resolve each FAL artist name to full artist data via search
        const resolved = await resolveFalArtists(falNames);

        // 4. Generate health report
        return generateHealthReport(targetArtist, resolved.artists, {
          checkedAt,
          attemptedNeighbourCount: falNames.length,
          warnings: resolved.warnings,
        });
      },
      { ttlSeconds: 600 } // 10 minute cache
    );

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof FalUnavailableError) {
      return NextResponse.json(error.report);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'Artist not found') {
      return NextResponse.json(
        { error: 'Spotify artist not found' },
        { status: 404 }
      );
    }

    await captureError('[FAL Analysis] Error', error, {
      component: 'fal-analysis',
      artistId,
    });
    return NextResponse.json(
      { error: 'Failed to analyze artist' },
      { status: 502 }
    );
  }
}

/**
 * Scrape "Fans Also Like" artist names from the Spotify profile page.
 * Returns either related-artist names or an unavailable diagnostic.
 */
type FalNameResult =
  | {
      status: 'ready';
      names: string[];
    }
  | {
      status: 'unavailable';
      detail: string;
      warnings: string[];
    };

async function scrapeFansAlsoLike(artistId: string): Promise<FalNameResult> {
  try {
    const response = await serverFetch(
      `https://open.spotify.com/artist/${artistId}/related`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html',
        },
        timeoutMs: 10_000,
        context: 'fal-scrape',
      }
    );

    if (!response.ok) {
      await captureWarning(
        `[FAL Scrape] Failed to fetch profile page: ${response.status}`,
        undefined,
        { component: 'fal-scrape', artistId }
      );
      return {
        status: 'unavailable',
        detail: 'Spotify returned an unavailable related-artists page.',
        warnings: [`Spotify related page returned HTTP ${response.status}.`],
      };
    }

    const html = await response.text();
    if (isSpotifyErrorPageHtml(html)) {
      await captureWarning(
        '[FAL Scrape] Spotify returned an error page',
        undefined,
        { component: 'fal-scrape', artistId }
      );
      return {
        status: 'unavailable',
        detail: 'Spotify showed an error page instead of related artists.',
        warnings: ['Spotify rendered a Page not available response.'],
      };
    }

    const names: string[] = [];

    // Try extracting from JSON-LD or embedded data
    const artistNamePattern =
      /"name"\s*:\s*"([^"]+)"\s*,\s*"@type"\s*:\s*"MusicGroup"/g;
    let match = artistNamePattern.exec(html);
    while (match) {
      names.push(match[1]);
      match = artistNamePattern.exec(html);
    }

    // Fallback: extract from embedded script data
    if (names.length === 0) {
      const dataPattern = /"artists":\s*\[([^\]]*)\]/g;
      let dataMatch = dataPattern.exec(html);
      while (dataMatch) {
        const nameMatches = dataMatch[1].matchAll(/"name"\s*:\s*"([^"]+)"/g);
        for (const nm of nameMatches) {
          if (nm[1] && !names.includes(nm[1])) {
            names.push(nm[1]);
          }
        }
        dataMatch = dataPattern.exec(html);
      }
    }

    // Final fallback: extract from test ID patterns
    if (names.length === 0) {
      const simplePattern = /data-testid="artist-link"[^>]*>([^<]+)</g;
      let simpleMatch = simplePattern.exec(html);
      while (simpleMatch) {
        const name = simpleMatch[1].trim();
        if (name && !names.includes(name)) {
          names.push(name);
        }
        simpleMatch = simplePattern.exec(html);
      }
    }

    return {
      status: 'ready',
      names,
    };
  } catch (error) {
    await captureError('[FAL Scrape] Error', error, {
      component: 'fal-scrape',
      artistId,
    });
    return {
      status: 'unavailable',
      detail: 'Spotify could not be reached for related artists.',
      warnings: ['Spotify related-artists scrape failed.'],
    };
  }
}

/**
 * Resolve FAL artist names to full SanitizedArtist objects via Spotify search.
 * Verifies name match to avoid wrong-artist substitution.
 */
async function resolveFalArtists(
  names: string[]
): Promise<{ artists: SanitizedArtist[]; warnings: string[] }> {
  const resolved: SanitizedArtist[] = [];
  let missingCount = 0;
  let mismatchCount = 0;
  let fetchErrorCount = 0;

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async name => {
        const searchResults = await searchSpotifyArtists(name, 1);
        if (searchResults.length > 0) {
          // Verify name match to avoid wrong-artist substitution
          if (searchResults[0].name.toLowerCase() !== name.toLowerCase()) {
            mismatchCount++;
            logger.warn(
              `[FAL Resolve] Name mismatch: searched "${name}", got "${searchResults[0].name}" — skipping`,
              undefined,
              'fal-analysis'
            );
            return null;
          }
          const fullArtist = await getSpotifyArtist(searchResults[0].spotifyId);
          if (!fullArtist) {
            fetchErrorCount++;
            logger.warn(
              `[FAL Resolve] Could not load artist details for "${name}" (${searchResults[0].spotifyId})`,
              undefined,
              'fal-analysis'
            );
            return null;
          }
          return fullArtist;
        }
        missingCount++;
        return null;
      })
    );

    for (const artist of results) {
      if (artist) resolved.push(artist);
    }
  }

  const warnings: string[] = [];
  if (missingCount > 0) {
    warnings.push(
      `${missingCount} related artist${missingCount === 1 ? '' : 's'} could not be resolved in Spotify search.`
    );
  }
  if (mismatchCount > 0) {
    warnings.push(
      `${mismatchCount} related artist${mismatchCount === 1 ? '' : 's'} were skipped because the top Spotify match did not match exactly.`
    );
  }
  if (fetchErrorCount > 0) {
    warnings.push(
      `${fetchErrorCount} related artist${fetchErrorCount === 1 ? '' : 's'} matched in Spotify search but could not be loaded fully.`
    );
  }

  return { artists: resolved, warnings };
}
