/**
 * Name Similarity Algorithms
 *
 * String similarity functions for comparing artist names
 * across different music platforms.
 *
 * Uses Jaro-Winkler similarity which is well-suited for names:
 * - Emphasizes matching prefixes
 * - Handles transpositions well
 * - Returns value between 0 (no similarity) and 1 (identical)
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum prefix length to consider in Jaro-Winkler (standard is 4) */
const MAX_PREFIX_LENGTH = 4;

/** Maximum prefix weight in Jaro-Winkler to prevent over-weighting */
const MAX_PREFIX_WEIGHT = 0.25;

/** Default prefix weight for Jaro-Winkler similarity */
const DEFAULT_PREFIX_WEIGHT = 0.1;

/** Default threshold for determining if two artist names are similar */
const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

/** Common prefixes to remove from artist names during normalization */
const ARTIST_NAME_PREFIXES = ['the ', 'a ', 'an ', 'dj ', 'mc ', 'lil '];

// ============================================================================
// Jaro Similarity - Helper Functions
// ============================================================================

interface MatchResult {
  s1Matches: boolean[];
  s2Matches: boolean[];
  matchCount: number;
}

/**
 * Find matching characters between two strings within the match window.
 */
function findMatchingCharacters(
  s1: string,
  s2: string,
  matchWindow: number
): MatchResult {
  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);
  let matchCount = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matchCount++;
        break;
      }
    }
  }

  return { s1Matches, s2Matches, matchCount };
}

/**
 * Count transpositions between matched characters.
 */
function countTranspositions(
  s1: string,
  s2: string,
  s1Matches: boolean[],
  s2Matches: boolean[]
): number {
  let transpositions = 0;
  let k = 0;

  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;

    while (!s2Matches[k]) k++;

    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return transpositions;
}

// ============================================================================
// Jaro Similarity
// ============================================================================

/**
 * Calculate the Jaro similarity between two strings.
 *
 * The Jaro similarity is:
 * - 0 if both strings are empty or have no matching characters
 * - 1 if the strings are identical
 * - A value between 0 and 1 otherwise
 *
 * @param s1 - First string
 * @param s2 - Second string
 * @returns Jaro similarity score (0-1)
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const { s1Matches, s2Matches, matchCount } = findMatchingCharacters(
    s1,
    s2,
    matchWindow
  );

  if (matchCount === 0) return 0;

  const transpositions = countTranspositions(s1, s2, s1Matches, s2Matches);

  return (
    (matchCount / s1.length +
      matchCount / s2.length +
      (matchCount - transpositions / 2) / matchCount) /
    3
  );
}

// ============================================================================
// Jaro-Winkler Similarity
// ============================================================================

/**
 * Calculate the Jaro-Winkler similarity between two strings.
 *
 * Jaro-Winkler gives more favorable ratings to strings that
 * match from the beginning. This is useful for names where
 * the beginning is often more significant.
 *
 * @param s1 - First string
 * @param s2 - Second string
 * @param prefixWeight - Weight for common prefix (default 0.1, max 0.25)
 * @returns Jaro-Winkler similarity score (0-1)
 */
export function jaroWinklerSimilarity(
  s1: string,
  s2: string,
  prefixWeight = DEFAULT_PREFIX_WEIGHT
): number {
  const jaro = jaroSimilarity(s1, s2);

  // Calculate common prefix length (up to MAX_PREFIX_LENGTH characters)
  let prefixLength = 0;
  const maxPrefixLength = Math.min(MAX_PREFIX_LENGTH, s1.length, s2.length);

  for (let i = 0; i < maxPrefixLength; i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  // Ensure prefix weight doesn't exceed standard limit
  const safeWeight = Math.min(prefixWeight, MAX_PREFIX_WEIGHT);

  return jaro + prefixLength * safeWeight * (1 - jaro);
}

// ============================================================================
// Artist Name Normalization
// ============================================================================

/**
 * Normalize an artist name for comparison.
 *
 * Normalization steps:
 * 1. Convert to lowercase
 * 2. Remove common prefixes (The, A, etc.)
 * 3. Remove special characters and extra whitespace
 * 4. Normalize Unicode characters
 *
 * @param name - Artist name to normalize
 * @returns Normalized name
 */
export function normalizeArtistName(name: string): string {
  let normalized = name
    // Convert to lowercase
    .toLowerCase()
    // Normalize Unicode (NFD decomposition then remove diacritics)
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    // Remove special characters except spaces
    .replaceAll(/[^\w\s]/g, '')
    // Replace multiple spaces with single space
    .replaceAll(/\s+/g, ' ')
    // Trim whitespace
    .trim();

  // Remove common prefixes
  for (const prefix of ARTIST_NAME_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break; // Only remove one prefix
    }
  }

  return normalized;
}

// ============================================================================
// Artist Name Similarity
// ============================================================================

/**
 * Calculate the similarity between two artist names.
 *
 * Uses Jaro-Winkler similarity on normalized names.
 *
 * @param name1 - First artist name
 * @param name2 - Second artist name
 * @returns Similarity score (0-1)
 */
export function artistNameSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeArtistName(name1);
  const normalized2 = normalizeArtistName(name2);

  // If either name is empty after normalization, return 0
  if (!normalized1 || !normalized2) {
    return 0;
  }

  // Exact match after normalization
  if (normalized1 === normalized2) {
    return 1;
  }

  return jaroWinklerSimilarity(normalized1, normalized2);
}

/**
 * Check if two artist names are likely the same artist.
 *
 * @param name1 - First artist name
 * @param name2 - Second artist name
 * @param threshold - Minimum similarity threshold (default 0.85)
 * @returns True if names are likely the same artist
 */
export function areArtistNamesSimilar(
  name1: string,
  name2: string,
  threshold = DEFAULT_SIMILARITY_THRESHOLD
): boolean {
  return artistNameSimilarity(name1, name2) >= threshold;
}
