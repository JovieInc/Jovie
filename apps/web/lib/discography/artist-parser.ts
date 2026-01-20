/**
 * Artist Name Parser
 *
 * Parses artist credits from track titles and artist arrays.
 * Handles common collaboration patterns like "feat.", "&", "vs", "(X Remix)", etc.
 * Follows DDEX/MusicBrainz standards for artist roles.
 */

/**
 * Artist roles aligned with DDEX ERN 4.3 and our database enum
 */
export type ArtistRole =
  | 'main_artist'
  | 'featured_artist'
  | 'remixer'
  | 'producer'
  | 'co_producer'
  | 'composer'
  | 'lyricist'
  | 'arranger'
  | 'conductor'
  | 'vs'
  | 'with'
  | 'other';

/**
 * Represents a parsed artist credit from a track
 */
export interface ParsedArtistCredit {
  /** Artist name (cleaned) */
  name: string;
  /** Role in the track */
  role: ArtistRole;
  /** Join phrase for display (e.g., " feat. ", " & ") */
  joinPhrase: string | null;
  /** Position in the credit list (0 = first) */
  position: number;
  /** Whether this is the primary artist */
  isPrimary: boolean;
  /** Spotify ID if available */
  spotifyId?: string;
  /** Image URL if available */
  imageUrl?: string;
}

/**
 * Spotify artist object structure (subset of what we need)
 */
export interface SpotifyArtistInput {
  id: string;
  name: string;
  images?: Array<{ url: string; width?: number; height?: number }>;
}

// ============================================================================
// Regex Patterns for Artist Credit Parsing
// ============================================================================

/**
 * Pattern to match remix credits in track titles
 * Matches: "(X Remix)", "[X Remix]", "(Remixed by X)", "(X Mix)"
 */
const REMIX_PATTERN =
  /[\(\[]\s*(?:(?:remixed\s+by|remix\s+by)\s+([^)\]]+?)|([^)\]]+?)\s+(?:remix|rmx|mix|edit|bootleg|rework|flip|version|vip))\s*[\)\]]/gi;

/**
 * Pattern to match featured artists in track titles
 * Matches: "(feat. X)", "(ft. X)", "(featuring X)", "feat. X", "ft. X"
 */
const FEATURED_PATTERN =
  /(?:[\(\[]?\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+?)[\)\]]?)/gi;

/**
 * Pattern to match "with" credits
 * Matches: "(with X)", "with X"
 */
const WITH_PATTERN = /(?:[\(\[]?\s*with\s+([^)\]]+?)[\)\]]?)/gi;

/**
 * Pattern to match "vs" credits in artist names
 * Matches: "X vs Y", "X vs. Y", "X versus Y"
 */
const VS_PATTERN = /\s+(?:vs\.?|versus)\s+/i;

/**
 * Pattern to match "&", "and", "x" between artist names
 * Note: "x" is tricky - only match when surrounded by spaces to avoid false positives
 */
const AND_PATTERN = /\s+(?:&|and|\s+x\s+)\s+/i;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize artist name for comparison and storage
 * - Lowercase
 * - Remove extra whitespace
 * - Remove special characters (keep basic punctuation)
 */
export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/[^\w\s'-]/g, '')
    .trim();
}

/**
 * Clean artist name for display
 * - Trim whitespace
 * - Remove duplicate spaces
 */
function cleanArtistName(name: string): string {
  return name.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Get the best image URL from Spotify images array
 */
function getBestImageUrl(
  images?: Array<{ url: string; width?: number; height?: number }>
): string | undefined {
  if (!images || images.length === 0) return undefined;

  // Sort by width descending, take the largest
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url;
}

function appendUniqueCredits(
  existingCredits: ParsedArtistCredit[],
  nextCredits: ParsedArtistCredit[],
  startPosition: number
): number {
  const existingNormalized = new Set(
    existingCredits.map(a => normalizeArtistName(a.name))
  );

  let nextPosition = startPosition;
  for (const credit of nextCredits) {
    const normalized = normalizeArtistName(credit.name);
    if (existingNormalized.has(normalized)) continue;

    existingNormalized.add(normalized);
    credit.position = nextPosition++;
    existingCredits.push(credit);
  }

  return nextPosition;
}

// ============================================================================
// Main Parser Functions
// ============================================================================

/**
 * Extract remixer(s) from track title
 *
 * @example
 * extractRemixers("Song (Daft Punk Remix)")
 * // Returns: [{ name: "Daft Punk", role: "remixer", ... }]
 *
 * @example
 * extractRemixers("Song (Remixed by Skrillex)")
 * // Returns: [{ name: "Skrillex", role: "remixer", ... }]
 */
export function extractRemixers(title: string): ParsedArtistCredit[] {
  const remixers: ParsedArtistCredit[] = [];
  let match: RegExpExecArray | null;
  let position = 0;

  // Reset regex state
  REMIX_PATTERN.lastIndex = 0;

  while ((match = REMIX_PATTERN.exec(title)) !== null) {
    const remixerPart = match[1] ?? match[2];
    if (!remixerPart) continue;

    // Check if this is just "Remix" without an artist
    const cleanedPart = cleanArtistName(remixerPart);
    if (
      !cleanedPart ||
      cleanedPart.toLowerCase() === 'remix' ||
      cleanedPart.toLowerCase() === 'original'
    ) {
      continue;
    }

    // Handle multiple remixers separated by & or and
    const remixerNames = splitByConjunction(cleanedPart);

    for (const remixerName of remixerNames) {
      if (remixerName.trim()) {
        remixers.push({
          name: cleanArtistName(remixerName),
          role: 'remixer',
          joinPhrase: remixers.length === 0 ? null : ' & ',
          position: position++,
          isPrimary: false,
        });
      }
    }
  }

  return remixers;
}

/**
 * Extract featured artists from track title
 *
 * @example
 * extractFeatured("Song (feat. Artist B)")
 * // Returns: [{ name: "Artist B", role: "featured_artist", ... }]
 */
export function extractFeatured(title: string): ParsedArtistCredit[] {
  const featured: ParsedArtistCredit[] = [];
  let match: RegExpExecArray | null;
  let position = 0;

  FEATURED_PATTERN.lastIndex = 0;

  while ((match = FEATURED_PATTERN.exec(title)) !== null) {
    const featuredPart = match[1];
    if (!featuredPart) continue;

    // Handle multiple featured artists
    const artistNames = splitByConjunction(featuredPart);

    for (const artistName of artistNames) {
      if (artistName.trim()) {
        featured.push({
          name: cleanArtistName(artistName),
          role: 'featured_artist',
          joinPhrase: featured.length === 0 ? ' feat. ' : ' & ',
          position: position++,
          isPrimary: false,
        });
      }
    }
  }

  return featured;
}

/**
 * Extract "with" credited artists from track title
 */
export function extractWith(title: string): ParsedArtistCredit[] {
  const withArtists: ParsedArtistCredit[] = [];
  let match: RegExpExecArray | null;
  let position = 0;

  WITH_PATTERN.lastIndex = 0;

  while ((match = WITH_PATTERN.exec(title)) !== null) {
    const withPart = match[1];
    if (!withPart) continue;

    const artistNames = splitByConjunction(withPart);

    for (const artistName of artistNames) {
      if (artistName.trim()) {
        withArtists.push({
          name: cleanArtistName(artistName),
          role: 'with',
          joinPhrase: withArtists.length === 0 ? ' with ' : ' & ',
          position: position++,
          isPrimary: false,
        });
      }
    }
  }

  return withArtists;
}

/**
 * Split artist name string by conjunction patterns (& / and / x)
 *
 * @example
 * splitByConjunction("Artist A & Artist B")
 * // Returns: ["Artist A", "Artist B"]
 */
export function splitByConjunction(artistString: string): string[] {
  // Split by & , "and", or standalone "x"
  return artistString
    .split(/\s*(?:&|,|\band\b|\bx\b)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Parse main artists from Spotify artist array, handling "vs" and "&" in names
 *
 * @example
 * parseMainArtists([{ id: "1", name: "Artist A vs Artist B" }])
 * // Returns artists with "vs" role for Artist B
 */
export function parseMainArtists(
  spotifyArtists: SpotifyArtistInput[]
): ParsedArtistCredit[] {
  function createCredit({
    name,
    role,
    joinPhrase,
    position,
    isPrimary,
    spotifyId,
    imageUrl,
  }: {
    name: string;
    role: ArtistRole;
    joinPhrase: string | null;
    position: number;
    isPrimary: boolean;
    spotifyId?: string;
    imageUrl?: string;
  }): ParsedArtistCredit {
    return {
      name,
      role,
      joinPhrase,
      position,
      isPrimary,
      spotifyId,
      imageUrl,
    };
  }

  function splitVsName(name: string): string[] | null {
    if (!VS_PATTERN.test(name)) return null;
    return name
      .split(VS_PATTERN)
      .map(p => p.trim())
      .filter(Boolean);
  }

  function splitMainConjunctionName(name: string): string[] | null {
    if (!AND_PATTERN.test(name)) return null;

    // If this is the first artist in the list AND the name has conjunction,
    // we might want to split. But be conservative - many bands have "&" in names
    // Only split if it looks like "Name & Name" not "The Name & The Something Band"
    const parts = name
      .split(AND_PATTERN)
      .map(p => p.trim())
      .filter(Boolean);

    // Only split if both parts are reasonably short (likely separate artists)
    if (parts.length === 2 && parts.every(p => p.length < 30)) {
      return parts;
    }
    return null;
  }

  const credits: ParsedArtistCredit[] = [];
  let position = 0;

  for (let i = 0; i < spotifyArtists.length; i++) {
    const artist = spotifyArtists[i];
    if (!artist) continue;

    const artistName = artist.name;
    const imageUrl = getBestImageUrl(artist.images);

    const vsParts = splitVsName(artistName);
    if (vsParts) {
      for (let j = 0; j < vsParts.length; j++) {
        const part = vsParts[j];
        if (!part) continue;

        credits.push(
          createCredit({
            name: part,
            role: j === 0 ? 'main_artist' : 'vs',
            joinPhrase: j === 0 ? null : ' vs ',
            position: position++,
            isPrimary: j === 0 && i === 0,
            // Only first artist gets the Spotify ID
            spotifyId: j === 0 ? artist.id : undefined,
            imageUrl: j === 0 ? imageUrl : undefined,
          })
        );
      }
      continue;
    }

    const conjunctionParts = splitMainConjunctionName(artistName);
    if (conjunctionParts) {
      for (let j = 0; j < conjunctionParts.length; j++) {
        const part = conjunctionParts[j];
        if (!part) continue;

        credits.push(
          createCredit({
            name: part,
            role: 'main_artist',
            joinPhrase: j === 0 ? null : ' & ',
            position: position++,
            isPrimary: j === 0 && i === 0,
            spotifyId: j === 0 ? artist.id : undefined,
            imageUrl: j === 0 ? imageUrl : undefined,
          })
        );
      }
      continue;
    }

    // Keep as single artist
    credits.push(
      createCredit({
        name: artistName,
        role: 'main_artist',
        joinPhrase: credits.length === 0 ? null : ', ',
        position: position++,
        isPrimary: i === 0,
        spotifyId: artist.id,
        imageUrl,
      })
    );
  }

  return credits;
}

/**
 * Main function: Parse all artist credits from track title and Spotify artists
 *
 * Combines:
 * - Main artists from Spotify artist array
 * - Featured artists from track title
 * - Remixers from track title
 * - "With" credits from track title
 *
 * @example
 * parseArtistCredits(
 *   "Song (feat. Rihanna) [Skrillex Remix]",
 *   [{ id: "1", name: "Calvin Harris" }]
 * )
 * // Returns:
 * // [
 * //   { name: "Calvin Harris", role: "main_artist", isPrimary: true, ... },
 * //   { name: "Rihanna", role: "featured_artist", ... },
 * //   { name: "Skrillex", role: "remixer", ... },
 * // ]
 */
export function parseArtistCredits(
  trackTitle: string,
  spotifyArtists: SpotifyArtistInput[]
): ParsedArtistCredit[] {
  const allCredits = parseMainArtists(spotifyArtists);

  let nextPosition = allCredits.length;
  nextPosition = appendUniqueCredits(
    allCredits,
    extractFeatured(trackTitle),
    nextPosition
  );
  nextPosition = appendUniqueCredits(
    allCredits,
    extractWith(trackTitle),
    nextPosition
  );
  appendUniqueCredits(allCredits, extractRemixers(trackTitle), nextPosition);

  return allCredits;
}

/**
 * Check if a track title indicates it's a remix
 */
export function isRemix(title: string): boolean {
  const lowerTitle = title.toLowerCase();

  const bracketPatterns = [
    /[\(\[].*remix.*[\)\]]/i,
    /[\(\[].*rmx.*[\)\]]/i,
    /[\(\[].*rework.*[\)\]]/i,
    /[\(\[].*bootleg.*[\)\]]/i,
    /[\(\[].*edit.*[\)\]]/i,
    /[\(\[].*flip.*[\)\]]/i,
  ];

  return (
    bracketPatterns.some(pattern => pattern.test(title)) ||
    lowerTitle.includes('remix') ||
    lowerTitle.includes('remixed by')
  );
}

/**
 * Remove collaboration credits from track title for clean display
 *
 * @example
 * cleanTrackTitle("Song (feat. Artist B) [Artist C Remix]")
 * // Returns: "Song"
 */
export function cleanTrackTitle(title: string): string {
  return (
    title
      // Remove featured credits
      .replaceAll(
        /[\(\[]?\s*(?:feat\.?|ft\.?|featuring)\s+[^)\]]+[\)\]]?/gi,
        ''
      )
      // Remove remix credits
      .replaceAll(REMIX_PATTERN, '')
      // Remove "with" credits
      .replaceAll(/[\(\[]?\s*with\s+[^)\]]+[\)\]]?/gi, '')
      // Clean up whitespace and trailing punctuation
      .replaceAll(/\s+/g, ' ')
      .replace(/\s*[-–]\s*$/, '')
      .trim()
  );
}
