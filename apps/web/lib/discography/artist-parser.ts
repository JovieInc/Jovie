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

const BRACKET_SEGMENT_PATTERN = /[([]\s*([^)\]]+?)\s*[)\]]/g;
const FEATURED_KEYWORD_PATTERN = /^(?:feat\.?|ft\.?|featuring)\b/i;
const FEATURED_INLINE_PATTERN = /\b(?:feat\.?|ft\.?|featuring)\b/gi;
const REMIXED_BY_PREFIX_PATTERN = /^(?:remixed\s+by|remix\s+by)\b/i;
const REMIX_TRAILING_PATTERN =
  /^(.*)\b(?:remix|rmx|mix|edit|bootleg|rework|flip|version|vip)\b/i;
const REMIX_KEYWORD_PATTERN =
  /\b(?:remix|rmx|mix|edit|bootleg|rework|flip|version|vip)\b/i;
const WITH_KEYWORD_PATTERN = /^with\b/i;
const WITH_INLINE_PATTERN = /\bwith\b/gi;

/**
 * Pattern to match "with" credits
 * Matches: "(with X)", "with X"
 */
const VS_SEPARATOR_PATTERN = /\s+(?:vs\.?|versus)\s+/i;
const AND_SEPARATOR_PATTERN = /\s+(?:&|and|x)\s+/i;

/**
 * Pattern to match "vs" credits in artist names
 * Matches: "X vs Y", "X vs. Y", "X versus Y"
 */
const BRACKET_BOUNDARY_PATTERN = /[()[\]]/;

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

function getBracketedSegments(title: string): string[] {
  const segments: string[] = [];
  BRACKET_SEGMENT_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = BRACKET_SEGMENT_PATTERN.exec(title)) !== null) {
    if (match[1]) {
      segments.push(match[1]);
    }
  }

  return segments;
}

function getRemixerPart(segment: string): string | null {
  const trimmed = cleanArtistName(segment);
  if (!trimmed) return null;

  if (REMIXED_BY_PREFIX_PATTERN.test(trimmed)) {
    return trimmed.replace(REMIXED_BY_PREFIX_PATTERN, '').trim() || null;
  }

  const trailingMatch = trimmed.match(REMIX_TRAILING_PATTERN);
  if (!trailingMatch) return null;

  return trailingMatch[1]?.trim() || null;
}

function getInlineFeaturedSegments(title: string): string[] {
  const segments: string[] = [];
  BRACKET_SEGMENT_PATTERN.lastIndex = 0;
  const titleWithoutBrackets = title.replace(BRACKET_SEGMENT_PATTERN, ' ');

  FEATURED_INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (
    (match = FEATURED_INLINE_PATTERN.exec(titleWithoutBrackets)) !== null
  ) {
    const startIndex = match.index + match[0].length;
    const remaining = titleWithoutBrackets.slice(startIndex);
    const boundaryIndex = remaining.search(BRACKET_BOUNDARY_PATTERN);
    const rawSegment =
      boundaryIndex === -1 ? remaining : remaining.slice(0, boundaryIndex);
    const cleaned = rawSegment.replace(/^[.\-–:]\s*/, '').trim();

    if (cleaned) {
      segments.push(cleaned);
    }
  }

  return segments;
}

function getInlineWithSegments(title: string): string[] {
  const segments: string[] = [];
  BRACKET_SEGMENT_PATTERN.lastIndex = 0;
  const titleWithoutBrackets = title.replace(BRACKET_SEGMENT_PATTERN, ' ');

  WITH_INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WITH_INLINE_PATTERN.exec(titleWithoutBrackets)) !== null) {
    const startIndex = match.index + match[0].length;
    const remaining = titleWithoutBrackets.slice(startIndex);
    const boundaryIndex = remaining.search(BRACKET_BOUNDARY_PATTERN);
    const rawSegment =
      boundaryIndex === -1 ? remaining : remaining.slice(0, boundaryIndex);
    const cleaned = rawSegment.replace(/^[.\-–:]\s*/, '').trim();

    if (cleaned) {
      segments.push(cleaned);
    }
  }

  return segments;
}

function stripBracketedSegments(
  title: string,
  shouldStrip: (segment: string) => boolean
): string {
  BRACKET_SEGMENT_PATTERN.lastIndex = 0;
  return title.replace(
    BRACKET_SEGMENT_PATTERN,
    (fullMatch, segment: string) => {
      if (segment && shouldStrip(segment)) {
        return '';
      }
      return fullMatch;
    }
  );
}

function stripInlineCredits(title: string, keywordPattern: RegExp): string {
  const flags = keywordPattern.flags.includes('g')
    ? keywordPattern.flags
    : `${keywordPattern.flags}g`;
  const regex = new RegExp(keywordPattern.source, flags);
  regex.lastIndex = 0;

  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(title)) !== null) {
    const startIndex = match.index;
    const afterStart = startIndex + match[0].length;
    const remaining = title.slice(afterStart);
    const boundaryIndex = remaining.search(BRACKET_BOUNDARY_PATTERN);
    const endIndex =
      boundaryIndex === -1 ? title.length : afterStart + boundaryIndex;

    result += title.slice(cursor, startIndex);
    cursor = endIndex;
  }

  result += title.slice(cursor);
  return result;
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

/**
 * Check if a bracketed segment contains remix keywords
 */
function isRemixSegment(segment: string): boolean {
  return (
    REMIX_KEYWORD_PATTERN.test(segment) ||
    REMIXED_BY_PREFIX_PATTERN.test(segment)
  );
}

/**
 * Extract cleaned remixer name from a segment, filtering out invalid names
 */
function extractValidRemixerName(segment: string): string | null {
  const remixerPart = getRemixerPart(segment);
  if (!remixerPart) return null;

  const cleanedPart = cleanArtistName(remixerPart);
  // Filter out generic keywords that aren't artist names
  if (
    !cleanedPart ||
    cleanedPart.toLowerCase() === 'remix' ||
    cleanedPart.toLowerCase() === 'original'
  ) {
    return null;
  }

  return cleanedPart;
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
  let position = 0;

  const remixSegments = getBracketedSegments(title).filter(isRemixSegment);

  for (const segment of remixSegments) {
    const cleanedPart = extractValidRemixerName(segment);
    if (!cleanedPart) continue;

    // Handle multiple remixers separated by & or and
    const remixerNames = splitByConjunction(cleanedPart);

    for (const remixerName of remixerNames) {
      if (!remixerName.trim()) continue;

      remixers.push({
        name: cleanArtistName(remixerName),
        role: 'remixer',
        joinPhrase: remixers.length === 0 ? null : ' & ',
        position: position++,
        isPrimary: false,
      });
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
  let position = 0;

  const bracketedSegments = getBracketedSegments(title);
  const inlineSegments = getInlineFeaturedSegments(title);
  const allSegments = [
    ...bracketedSegments
      .map(segment => segment.trim())
      .filter(segment => FEATURED_KEYWORD_PATTERN.test(segment))
      .map(segment =>
        segment
          .replace(FEATURED_KEYWORD_PATTERN, '')
          .replace(/^[.\-–:]\s*/, '')
          .trim()
      )
      .filter(Boolean),
    ...inlineSegments,
  ];

  for (const featuredPart of allSegments) {
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
  let position = 0;

  const bracketedSegments = getBracketedSegments(title);
  const inlineSegments = getInlineWithSegments(title);
  const allSegments = [
    ...bracketedSegments
      .map(segment => segment.trim())
      .filter(segment => WITH_KEYWORD_PATTERN.test(segment))
      .map(segment =>
        segment
          .replace(WITH_KEYWORD_PATTERN, '')
          .replace(/^[.\-–:]\s*/, '')
          .trim()
      )
      .filter(Boolean),
    ...inlineSegments,
  ];

  for (const withPart of allSegments) {
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

// Helper to split "vs" pattern in artist name
function splitVsName(name: string): string[] | null {
  if (!VS_SEPARATOR_PATTERN.test(name)) return null;
  return name
    .split(VS_SEPARATOR_PATTERN)
    .map(p => p.trim())
    .filter(Boolean);
}

// Helper to split conjunction pattern in artist name
function splitMainConjunctionName(name: string): string[] | null {
  if (!AND_SEPARATOR_PATTERN.test(name)) return null;

  const parts = name
    .split(AND_SEPARATOR_PATTERN)
    .map(p => p.trim())
    .filter(Boolean);

  // Only split if both parts are reasonably short (likely separate artists)
  if (parts.length === 2 && parts.every(p => p.length < 30)) {
    return parts;
  }
  return null;
}

// Process "vs" split artists into credits
function processVsParts(
  vsParts: string[],
  artistIndex: number,
  artist: SpotifyArtistInput,
  imageUrl: string | undefined,
  credits: ParsedArtistCredit[],
  startPosition: number
): number {
  let position = startPosition;
  for (let j = 0; j < vsParts.length; j++) {
    const part = vsParts[j];
    if (!part) continue;

    credits.push({
      name: part,
      role: j === 0 ? 'main_artist' : 'vs',
      joinPhrase: j === 0 ? null : ' vs ',
      position: position++,
      isPrimary: j === 0 && artistIndex === 0,
      spotifyId: j === 0 ? artist.id : undefined,
      imageUrl: j === 0 ? imageUrl : undefined,
    });
  }
  return position;
}

// Process conjunction split artists into credits
function processConjunctionParts(
  conjunctionParts: string[],
  artistIndex: number,
  artist: SpotifyArtistInput,
  imageUrl: string | undefined,
  credits: ParsedArtistCredit[],
  startPosition: number
): number {
  let position = startPosition;
  for (let j = 0; j < conjunctionParts.length; j++) {
    const part = conjunctionParts[j];
    if (!part) continue;

    credits.push({
      name: part,
      role: 'main_artist',
      joinPhrase: j === 0 ? null : ' & ',
      position: position++,
      isPrimary: j === 0 && artistIndex === 0,
      spotifyId: j === 0 ? artist.id : undefined,
      imageUrl: j === 0 ? imageUrl : undefined,
    });
  }
  return position;
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

    const artistName = artist.name;
    const imageUrl = getBestImageUrl(artist.images);

    const vsParts = splitVsName(artistName);
    if (vsParts) {
      position = processVsParts(
        vsParts,
        i,
        artist,
        imageUrl,
        credits,
        position
      );
      continue;
    }

    const conjunctionParts = splitMainConjunctionName(artistName);
    if (conjunctionParts) {
      position = processConjunctionParts(
        conjunctionParts,
        i,
        artist,
        imageUrl,
        credits,
        position
      );
      continue;
    }

    // Keep as single artist
    credits.push({
      name: artistName,
      role: 'main_artist',
      joinPhrase: credits.length === 0 ? null : ', ',
      position: position++,
      isPrimary: i === 0,
      spotifyId: artist.id,
      imageUrl,
    });
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
    /[([].*remix.*[)\]]/i,
    /[([].*rmx.*[)\]]/i,
    /[([].*rework.*[)\]]/i,
    /[([].*bootleg.*[)\]]/i,
    /[([].*edit.*[)\]]/i,
    /[([].*flip.*[)\]]/i,
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
  const withoutBracketedFeatured = stripBracketedSegments(title, segment =>
    FEATURED_KEYWORD_PATTERN.test(segment)
  );
  const withoutBracketedRemix = stripBracketedSegments(
    withoutBracketedFeatured,
    segment =>
      REMIX_KEYWORD_PATTERN.test(segment) ||
      REMIXED_BY_PREFIX_PATTERN.test(segment)
  );
  const withoutBracketedWith = stripBracketedSegments(
    withoutBracketedRemix,
    segment => WITH_KEYWORD_PATTERN.test(segment)
  );
  const withoutInlineFeatured = stripInlineCredits(
    withoutBracketedWith,
    FEATURED_INLINE_PATTERN
  );
  const withoutInlineWith = stripInlineCredits(
    withoutInlineFeatured,
    WITH_INLINE_PATTERN
  );

  return withoutInlineWith
    .replaceAll(/\s+/g, ' ')
    .replace(/\s*[-–]\s*$/, '')
    .trim();
}
