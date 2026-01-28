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
 * Pattern to capture bracketed credits in track titles
 * Matches: "(...)" and "[...]"
 */
const BRACKETED_CREDIT_PATTERN = /[([]\s*([^[\])]+?)\s*[)\]]/g;

/**
 * Pattern to identify featured credits in track titles
 * Matches: "feat.", "ft.", "featuring"
 */
const FEATURED_MARKER_PATTERN = /\b(?:feat\.?|ft\.?|featuring)\b/i;
const WITH_MARKER_PATTERN = /\bwith\b/i;

/**
 * Pattern to identify remix credits in track titles
 * Matches: "remixed by", "remix", "rmx", "mix", "edit", "bootleg", "rework"
 */
const REMIXED_BY_PATTERN = /\b(?:remixed|remix)\s+by\b/i;
const REMIX_KEYWORD_PATTERN =
  /\b(?:remix|rmx|mix|edit|bootleg|rework|flip|version|vip)\b/i;

/**
 * Pattern to match "with" credits
 * Matches: "(with X)", "with X"
 */
const WITH_PATTERN =
  /(?:[([]\s*\bwith\b\s+([^)\]]+?)\s*[)\]])|(?:\bwith\s+([^()[\]]+))/gi;

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

type BracketedCredit = {
  content: string;
  start: number;
  end: number;
};

function getBracketedCredits(title: string): BracketedCredit[] {
  const credits: BracketedCredit[] = [];
  BRACKETED_CREDIT_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = BRACKETED_CREDIT_PATTERN.exec(title)) !== null) {
    const content = match[1]?.trim();
    if (!content) continue;
    const start = match.index;
    credits.push({
      content,
      start,
      end: start + match[0].length,
    });
  }

  return credits;
}

function isRemixSegment(segment: string): boolean {
  if (REMIXED_BY_PATTERN.test(segment)) return true;

  const keywordMatch = segment.match(REMIX_KEYWORD_PATTERN);
  if (keywordMatch?.index == null || keywordMatch.index === 0) {
    return false;
  }

  return keywordMatch.index > 0;
}

function extractRemixerName(segment: string): string | null {
  if (REMIXED_BY_PATTERN.test(segment)) {
    const name = segment.replace(REMIXED_BY_PATTERN, '').trim();
    return name.length > 0 ? name : null;
  }

  const keywordMatch = segment.match(REMIX_KEYWORD_PATTERN);
  if (keywordMatch?.index == null || keywordMatch.index === 0) {
    return null;
  }

  const name = segment.slice(0, keywordMatch.index).trim();
  return name.length > 0 ? name : null;
}

function extractFeaturedPartFromSegment(segment: string): string | null {
  const markerMatch = segment.match(FEATURED_MARKER_PATTERN);
  if (markerMatch?.index == null) {
    return null;
  }

  const startIndex = markerMatch.index + markerMatch[0].length;
  const rawPart = segment.slice(startIndex).trim();
  const cleaned = rawPart.replace(/^[\s.:,-]+/, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function extractInlineFeaturedPart(
  title: string,
  bracketedCredits: BracketedCredit[]
): Array<{ part: string; index: number }> {
  const results: Array<{ part: string; index: number }> = [];
  const markerPattern = new RegExp(FEATURED_MARKER_PATTERN.source, 'gi');

  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(title)) !== null) {
    const matchIndex = match.index ?? 0;
    const isInsideBracket = bracketedCredits.some(
      credit => matchIndex >= credit.start && matchIndex <= credit.end
    );
    if (isInsideBracket) continue;

    const afterMarker = title.slice(matchIndex + match[0].length);
    const bracketIndex = afterMarker.search(/[[(]/);
    const rawPart =
      bracketIndex >= 0 ? afterMarker.slice(0, bracketIndex) : afterMarker;
    const cleaned = rawPart.replace(/^[\s.:,-]+/, '').trim();
    if (!cleaned) continue;

    results.push({ part: cleaned, index: matchIndex });
  }

  return results;
}

function stripBracketedCredits(
  title: string,
  shouldStrip: (segment: string) => boolean
): string {
  return title.replace(BRACKETED_CREDIT_PATTERN, (match, segment: string) =>
    shouldStrip(segment) ? '' : match
  );
}

function removeInlineCredits(title: string, markerPattern: RegExp): string {
  let nextTitle = title;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(markerPattern.source, 'i');

  while ((match = pattern.exec(nextTitle)) !== null) {
    const before = nextTitle.slice(0, match.index);
    const after = nextTitle.slice(match.index + match[0].length);
    const bracketIndex = after.search(/[[(]/);
    const remainder = bracketIndex >= 0 ? after.slice(bracketIndex) : '';
    nextTitle = `${before}${remainder}`;
  }

  return nextTitle;
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
  const bracketedCredits = getBracketedCredits(title);

  for (const credit of bracketedCredits) {
    const remixerPart = extractRemixerName(credit.content);
    if (!remixerPart) {
      continue;
    }

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
  let position = 0;
  const bracketedCredits = getBracketedCredits(title);
  const featuredParts: Array<{ part: string; index: number }> = [];

  for (const credit of bracketedCredits) {
    const featuredPart = extractFeaturedPartFromSegment(credit.content);
    if (!featuredPart) continue;
    featuredParts.push({ part: featuredPart, index: credit.start });
  }

  for (const inlinePart of extractInlineFeaturedPart(title, bracketedCredits)) {
    featuredParts.push(inlinePart);
  }

  featuredParts.sort((a, b) => a.index - b.index);

  for (const featuredPart of featuredParts) {
    // Handle multiple featured artists
    const artistNames = splitByConjunction(featuredPart.part);

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
    const withPart = match[1] ?? match[2];
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

// Helper to split "vs" pattern in artist name
function splitVsName(name: string): string[] | null {
  if (!VS_PATTERN.test(name)) return null;
  return name
    .split(VS_PATTERN)
    .map(p => p.trim())
    .filter(Boolean);
}

// Helper to split conjunction pattern in artist name
function splitMainConjunctionName(name: string): string[] | null {
  if (!AND_PATTERN.test(name)) return null;

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
  const bracketedCredits = getBracketedCredits(title);

  return (
    bracketedCredits.some(credit => isRemixSegment(credit.content)) ||
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
  const withoutFeatured = stripBracketedCredits(title, segment =>
    FEATURED_MARKER_PATTERN.test(segment)
  );
  const withoutRemix = stripBracketedCredits(withoutFeatured, isRemixSegment);
  const withoutWith = stripBracketedCredits(withoutRemix, segment =>
    WITH_MARKER_PATTERN.test(segment)
  );
  const withoutInlineFeatured = removeInlineCredits(
    withoutWith,
    FEATURED_MARKER_PATTERN
  );
  const withoutInlineWith = removeInlineCredits(
    withoutInlineFeatured,
    WITH_MARKER_PATTERN
  );

  return withoutInlineWith
    .replaceAll(/\s+/g, ' ')
    .replace(/\s*[-–]\s*$/, '')
    .trim();
}
