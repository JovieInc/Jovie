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
  /[\(\[]\s*(?:(?:remixed\s+by|remix\s+by)\s+)?([^)\]]+?)(?:\s+(?:remix|rmx|mix|edit|bootleg|rework|flip|version|vip))?\s*[\)\]]/gi;

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
    const remixerPart = match[1];
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

/** Context for building artist credits during parsing */
interface ArtistCreditContext {
  artist: SpotifyArtistInput;
  imageUrl: string | undefined;
  isFirstArtist: boolean;
  creditsCount: number;
  currentPosition: number;
}

/**
 * Handle "vs" pattern in artist name (e.g., "Artist A vs Artist B")
 * Returns parsed credits and the number of credits added
 */
function handleVsPattern(
  artistName: string,
  ctx: ArtistCreditContext
): { credits: ParsedArtistCredit[]; positionIncrement: number } {
  const credits: ParsedArtistCredit[] = [];
  const parts = artistName.split(VS_PATTERN);
  let positionIncrement = 0;

  for (let j = 0; j < parts.length; j++) {
    const part = parts[j]?.trim();
    if (!part) continue;

    const isFirst = j === 0;
    credits.push({
      name: part,
      role: isFirst ? 'main_artist' : 'vs',
      joinPhrase: isFirst ? (ctx.isFirstArtist ? null : ', ') : ' vs ',
      position: ctx.currentPosition + positionIncrement,
      isPrimary: isFirst && ctx.isFirstArtist,
      spotifyId: isFirst ? ctx.artist.id : undefined,
      imageUrl: isFirst ? ctx.imageUrl : undefined,
    });
    positionIncrement++;
  }

  return { credits, positionIncrement };
}

/**
 * Handle "&" / "and" pattern in artist name (e.g., "Artist A & Artist B")
 * Only splits if both parts are reasonably short (< 30 chars) to avoid
 * splitting band names that legitimately include "&"
 */
function handleAndPattern(
  artistName: string,
  ctx: ArtistCreditContext
): { credits: ParsedArtistCredit[]; positionIncrement: number } {
  const parts = artistName.split(AND_PATTERN);
  const shouldSplit =
    parts.length === 2 && parts.every(p => p && p.length < 30);

  if (!shouldSplit) {
    return {
      credits: [createSingleArtistCredit(artistName, ctx)],
      positionIncrement: 1,
    };
  }

  const credits: ParsedArtistCredit[] = [];
  let positionIncrement = 0;

  for (let j = 0; j < parts.length; j++) {
    const part = parts[j]?.trim();
    if (!part) continue;

    const isFirst = j === 0;
    credits.push({
      name: part,
      role: 'main_artist',
      joinPhrase: isFirst ? (ctx.currentPosition > 0 ? ', ' : null) : ' & ',
      position: ctx.currentPosition + positionIncrement,
      isPrimary: isFirst && ctx.isFirstArtist,
      spotifyId: isFirst ? ctx.artist.id : undefined,
      imageUrl: isFirst ? ctx.imageUrl : undefined,
    });
    positionIncrement++;
  }

  return { credits, positionIncrement };
}

/**
 * Create a single artist credit (no splitting needed)
 */
function createSingleArtistCredit(
  artistName: string,
  ctx: ArtistCreditContext
): ParsedArtistCredit {
  return {
    name: artistName,
    role: 'main_artist',
    joinPhrase: ctx.creditsCount === 0 ? null : ', ',
    position: ctx.currentPosition,
    isPrimary: ctx.isFirstArtist,
    spotifyId: ctx.artist.id,
    imageUrl: ctx.imageUrl,
  };
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
  const credits: ParsedArtistCredit[] = [];
  let position = 0;

  for (let i = 0; i < spotifyArtists.length; i++) {
    const artist = spotifyArtists[i];
    if (!artist) continue;

    const ctx: ArtistCreditContext = {
      artist,
      imageUrl: getBestImageUrl(artist.images),
      isFirstArtist: i === 0,
      creditsCount: credits.length,
      currentPosition: position,
    };

    const artistName = artist.name;
    let result: { credits: ParsedArtistCredit[]; positionIncrement: number };

    if (VS_PATTERN.test(artistName)) {
      result = handleVsPattern(artistName, ctx);
    } else if (AND_PATTERN.test(artistName)) {
      result = handleAndPattern(artistName, ctx);
    } else {
      result = {
        credits: [createSingleArtistCredit(artistName, ctx)],
        positionIncrement: 1,
      };
    }

    credits.push(...result.credits);
    position += result.positionIncrement;
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
  const allCredits: ParsedArtistCredit[] = [];

  // 1. Parse main artists from Spotify array
  const mainArtists = parseMainArtists(spotifyArtists);
  allCredits.push(...mainArtists);

  // 2. Extract featured artists from title
  const featured = extractFeatured(trackTitle);

  // Dedupe against main artists (sometimes Spotify includes featured artists in the array)
  const mainNormalized = new Set(
    mainArtists.map(a => normalizeArtistName(a.name))
  );
  const uniqueFeatured = featured.filter(
    f => !mainNormalized.has(normalizeArtistName(f.name))
  );

  // Update positions to continue from main artists
  let nextPosition = allCredits.length;
  for (const f of uniqueFeatured) {
    f.position = nextPosition++;
    allCredits.push(f);
  }

  // 3. Extract "with" credits from title
  const withCredits = extractWith(trackTitle);
  const existingNormalized = new Set(
    allCredits.map(a => normalizeArtistName(a.name))
  );
  const uniqueWith = withCredits.filter(
    w => !existingNormalized.has(normalizeArtistName(w.name))
  );

  for (const w of uniqueWith) {
    w.position = nextPosition++;
    allCredits.push(w);
  }

  // 4. Extract remixers from title
  const remixers = extractRemixers(trackTitle);
  const allNormalized = new Set(
    allCredits.map(a => normalizeArtistName(a.name))
  );
  const uniqueRemixers = remixers.filter(
    r => !allNormalized.has(normalizeArtistName(r.name))
  );

  for (const r of uniqueRemixers) {
    r.position = nextPosition++;
    allCredits.push(r);
  }

  return allCredits;
}

/**
 * Check if a track title indicates it's a remix
 */
export function isRemix(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return (
    /[\(\[].*remix.*[\)\]]/i.test(title) ||
    /[\(\[].*rmx.*[\)\]]/i.test(title) ||
    /[\(\[].*rework.*[\)\]]/i.test(title) ||
    /[\(\[].*bootleg.*[\)\]]/i.test(title) ||
    /[\(\[].*edit.*[\)\]]/i.test(title) ||
    /[\(\[].*flip.*[\)\]]/i.test(title) ||
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
      .replaceAll(/\s*[-–]\s*$/, '')
      .trim()
  );
}
