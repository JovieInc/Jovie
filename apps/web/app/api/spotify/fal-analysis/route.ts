import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cacheQuery } from '@/lib/db/cache';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  getSpotifyArtist,
  isSpotifyAvailable,
  searchSpotifyArtists,
} from '@/lib/spotify/client';
import type { SanitizedArtist } from '@/lib/spotify/sanitize';
import { generateHealthReport } from '@/lib/spotify/scoring';

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

    console.error('[FAL Analysis] Error:', message);
    return NextResponse.json(
      { error: 'Failed to analyze artist' },
      { status: 502 }
    );
  }
}

/**
 * Scrape "Fans Also Like" artist names from the Spotify profile page.
 * Fetches the /artist/{id}/related page and extracts artist names from HTML.
 */
async function scrapeFansAlsoLike(artistId: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://open.spotify.com/artist/${artistId}/related`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      console.warn(
        `[FAL Scrape] Failed to fetch profile page: ${response.status}`
      );
      return [];
    }

    const html = await response.text();

    // Extract artist names from the page content.
    // The Spotify profile page renders artist cards with names in the HTML.
    // We look for patterns in the server-rendered HTML.
    const names: string[] = [];

    // Pattern: artist names appear in meta content or structured data
    // The page title is "Spotify – Artists Fans of {Name} also like"
    // Artist names appear as link text in the page

    // Try extracting from JSON-LD or embedded data
    const artistNamePattern =
      /"name"\s*:\s*"([^"]+)"\s*,\s*"@type"\s*:\s*"MusicGroup"/g;
    let match = artistNamePattern.exec(html);
    while (match) {
      names.push(match[1]);
      match = artistNamePattern.exec(html);
    }

    // Fallback: extract from meta tags or og data
    if (names.length === 0) {
      // Try a simpler pattern: artist card links contain artist names
      // Spotify's SSR includes artist data in script tags
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

    // Final fallback: extract from title/heading patterns
    if (names.length === 0) {
      // The HTML often contains artist names as text content after "Artist" labels
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
    console.error('[FAL Scrape] Error:', error);
    return [];
  }
}

/**
 * Resolve FAL artist names to full SanitizedArtist objects via Spotify search.
 * Searches each name and takes the top result.
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
          // Search results are SearchArtistResult, need full artist data
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
