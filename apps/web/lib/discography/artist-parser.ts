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
  | 'mix_engineer'
  | 'mastering_engineer'
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
  /** Apple Music ID if available */
  appleMusicId?: string;
  /** Provider role before an explicit title role resolved the canonical role. */
  observedRole?: ArtistRole;
  /** Evidence used to resolve the canonical role. */
  roleSource?: 'provider_artist' | 'title';
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

const BRACKET_SEGMENT_PATTERN = /[([]\s{0,5}([^)\]]+?)\s{0,5}[)\]]/g;
const FEATURED_KEYWORD_PATTERN = /^(?:feat\.?|ft\.?|featuring)\b/i;
const FEATURED_INLINE_PATTERN = /\b(?:feat\.?|ft\.?|featuring)\b/gi;
const REMIXED_BY_PREFIX_PATTERN = /^(?:remixed\s+by|remix\s+by)\b/i;
const REMIX_TRAILING_PATTERN =
  /^(.*?)\b(?:remix|rmx|mix|edit|bootleg|rework|flip|version|vip)\b/i;
const REMIX_KEYWORD_PATTERN =
  /\b(?:remix|rmx|mix|edit|bootleg|rework|flip|version|vip)\b/i;
const WITH_KEYWORD_PATTERN = /^with\b/i;
const WITH_INLINE_PATTERN = /\bwith\b/gi;

/**
 * Pattern to match "with" credits
 * Matches: "(with X)", "with X"
 */
const VS_SEPARATOR_PATTERN = / +(?:vs\.?|versus) +/i;
const AND_SEPARATOR_PATTERN = / +(?:&|and|x) +/i;

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
  if (!name) return '';
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
  if (!name) return '';
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

  const trailingMatch = REMIX_TRAILING_PATTERN.exec(trimmed);
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

function applyExplicitRoles(
  mainCredits: ParsedArtistCredit[],
  explicitCredits: ParsedArtistCredit[]
): ParsedArtistCredit[] {
  const explicitNames = new Set(
    explicitCredits.map(credit => normalizeArtistName(credit.name))
  );
  const mainIdentityByName = new Map(
    mainCredits.map(credit => [normalizeArtistName(credit.name), credit])
  );
  const keptMainCredits = mainCredits.filter(
    credit => !explicitNames.has(normalizeArtistName(credit.name))
  );
  const seenExplicitRoles = new Set<string>();
  const keptExplicitCredits: ParsedArtistCredit[] = [];

  for (const credit of explicitCredits) {
    const normalizedName = normalizeArtistName(credit.name);
    const mainCredit = mainIdentityByName.get(normalizedName);
    const identity =
      mainCredit?.spotifyId ?? mainCredit?.appleMusicId ?? normalizedName;
    const roleKey = `${credit.role}:${identity}`;
    if (seenExplicitRoles.has(roleKey)) continue;
    seenExplicitRoles.add(roleKey);

    keptExplicitCredits.push({
      ...credit,
      spotifyId: mainCredit?.spotifyId ?? credit.spotifyId,
      appleMusicId: mainCredit?.appleMusicId ?? credit.appleMusicId,
      observedRole: mainCredit ? 'main_artist' : credit.observedRole,
    });
  }

  return [...keptMainCredits, ...keptExplicitCredits].map(
    (credit, position) => ({ ...credit, position })
  );
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

function comparableArtistName(name: string): string {
  return name.trim().toLowerCase().replaceAll(/\s+/g, ' ');
}

function knownProviderArtistNames(
  names: readonly string[] | undefined
): ReadonlySet<string> | undefined {
  if (!names || names.length === 0) return undefined;
  const known = new Set<string>();
  for (const name of names) {
    const comparable = comparableArtistName(name);
    if (comparable) known.add(comparable);
  }
  return known.size > 0 ? known : undefined;
}

function matchesKnownProviderArtist(
  name: string,
  known: ReadonlySet<string> | undefined
): boolean {
  if (!known) return false;
  return known.has(comparableArtistName(name));
}

/**
 * Split artist name string by conjunction patterns (& / and / x)
 *
 * A whole name that matches a known provider artist stays intact. "Tones And I"
 * is one artist; "Artist A & Artist B" still splits when that full string is
 * not itself a provider artist.
 *
 * @example
 * splitByConjunction("Artist A & Artist B")
 * // Returns: ["Artist A", "Artist B"]
 */
export function splitByConjunction(
  artistString: string,
  knownProviderArtists?: readonly string[]
): string[] {
  const trimmed = artistString.trim();
  const known = knownProviderArtistNames(knownProviderArtists);
  if (trimmed && matchesKnownProviderArtist(trimmed, known)) {
    return [trimmed];
  }

  // Split by & , "and", or standalone "x"
  return artistString
    .split(/ *(?:&|,|\band\b|\bx\b) */i)
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

// Helper to split conjunction pattern in artist name.
// Provider artist objects are already identities. Do not split "and" / "&"
// when the whole name is one of those artists ("Tones And I").
function splitMainConjunctionName(
  name: string,
  knownProviderArtists?: ReadonlySet<string>
): string[] | null {
  if (matchesKnownProviderArtist(name, knownProviderArtists)) return null;
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
      isPrimary: j === 0,
      spotifyId: j === 0 ? artist.id : undefined,
      imageUrl: j === 0 ? imageUrl : undefined,
    });
  }
  return position;
}

// Process conjunction split artists into credits
function processConjunctionParts(
  conjunctionParts: string[],
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
      isPrimary: true,
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
  const knownProviderArtists = knownProviderArtistNames(
    spotifyArtists.flatMap(artist => (artist?.name ? [artist.name] : []))
  );

  for (const artist of spotifyArtists) {
    if (!artist) continue;

    const artistName = artist.name;
    const imageUrl = getBestImageUrl(artist.images);

    const vsParts = splitVsName(artistName);
    if (vsParts) {
      position = processVsParts(vsParts, artist, imageUrl, credits, position);
      continue;
    }

    const conjunctionParts = splitMainConjunctionName(
      artistName,
      knownProviderArtists
    );
    if (conjunctionParts) {
      position = processConjunctionParts(
        conjunctionParts,
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
      isPrimary: true,
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
  const mainCredits = parseMainArtists(spotifyArtists).map(credit => ({
    ...credit,
    roleSource: 'provider_artist' as const,
  }));
  const explicitCredits = [
    ...extractFeatured(trackTitle),
    ...extractWith(trackTitle),
    ...extractRemixers(trackTitle),
  ].map(credit => ({ ...credit, roleSource: 'title' as const }));

  return applyExplicitRoles(mainCredits, explicitCredits);
}

/**
 * Normalize a provider display artist line together with its title roles.
 * The provider line has no stable per-artist IDs, so exact title-role evidence
 * determines role without inventing an identity or using fuzzy name matching.
 */
export function parseArtistCreditsFromArtistLine(
  trackTitle: string,
  artistLine: string
): ParsedArtistCredit[] {
  return parseArtistCredits(
    trackTitle,
    splitByConjunction(artistLine).map(name => ({ id: '', name }))
  ).map(({ spotifyId, ...credit }) =>
    spotifyId ? { ...credit, spotifyId } : credit
  );
}

/**
 * Check if a track title indicates it's a remix
 */
export function isRemix(title: string): boolean {
  const lowerTitle = title.toLowerCase();

  const bracketPatterns = [
    /[([]\s*[^)\]]*remix[^)\]]*[)\]]/i,
    /[([]\s*[^)\]]*rmx[^)\]]*[)\]]/i,
    /[([]\s*[^)\]]*rework[^)\]]*[)\]]/i,
    /[([]\s*[^)\]]*bootleg[^)\]]*[)\]]/i,
    /[([]\s*[^)\]]*edit[^)\]]*[)\]]/i,
    /[([]\s*[^)\]]*flip[^)\]]*[)\]]/i,
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
    .replace(/ *[-–] *$/, '')
    .trim();
}
