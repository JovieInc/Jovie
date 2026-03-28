import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
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
import { generateHealthReport } from '@/lib/spotify/scoring';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

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
  const { userId } = await auth();
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
        // 1. Fetch target artist
        const targetArtist = await getSpotifyArtist(artistId);
        if (!targetArtist) {
          throw new Error('Artist not found');
        }

        // 2. Scrape FAL names from Spotify profile page
        const falNames = await scrapeFansAlsoLike(artistId);

        // null means scraper failed (not "no FAL data") — don't cache
        if (falNames === null) {
          throw new Error('FAL scrape failed');
        }

        if (falNames.length === 0) {
          return generateHealthReport(targetArtist, []);
        }

        // 3. Resolve each FAL artist name to full artist data via search
        const resolvedArtists = await resolveFalArtists(falNames);

        // 4. Generate health report
        return generateHealthReport(targetArtist, resolvedArtists);
      },
      { ttlSeconds: 600 } // 10 minute cache
    );

    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'Artist not found') {
      return NextResponse.json(
        { error: 'Spotify artist not found' },
        { status: 404 }
      );
    }

    if (message === 'FAL scrape failed') {
      return NextResponse.json(
        {
          error:
            'Could not retrieve FAL data from Spotify. The scraper may be blocked or the page structure changed.',
        },
        { status: 502 }
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
 * Returns null on failure (as distinct from empty array = no FAL artists).
 */
async function scrapeFansAlsoLike(artistId: string): Promise<string[] | null> {
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
      return null;
    }

    const html = await response.text();

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

    return names;
  } catch (error) {
    await captureError('[FAL Scrape] Error', error, {
      component: 'fal-scrape',
      artistId,
    });
    return null;
  }
}

/**
 * Resolve FAL artist names to full SanitizedArtist objects via Spotify search.
 * Verifies name match to avoid wrong-artist substitution.
 */
async function resolveFalArtists(names: string[]): Promise<SanitizedArtist[]> {
  const resolved: SanitizedArtist[] = [];

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
            logger.warn(
              `[FAL Resolve] Name mismatch: searched "${name}", got "${searchResults[0].name}" — skipping`,
              undefined,
              'fal-analysis'
            );
            return null;
          }
          const fullArtist = await getSpotifyArtist(searchResults[0].spotifyId);
          return fullArtist;
        }
        return null;
      })
    );

    for (const artist of results) {
      if (artist) resolved.push(artist);
    }
  }

  return resolved;
}
