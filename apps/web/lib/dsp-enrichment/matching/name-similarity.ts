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

  // Calculate the match window
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;

      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;

    while (!s2Matches[k]) k++;

    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3;

  return jaro;
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
  prefixWeight = 0.1
): number {
  const jaro = jaroSimilarity(s1, s2);

  // Calculate common prefix length (up to 4 characters)
  let prefixLength = 0;
  const maxPrefixLength = Math.min(4, s1.length, s2.length);

  for (let i = 0; i < maxPrefixLength; i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  // Ensure prefix weight doesn't exceed 0.25 (standard limit)
  const safeWeight = Math.min(prefixWeight, 0.25);

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
    .replace(/[\u0300-\u036f]/g, '')
    // Remove special characters except spaces
    .replace(/[^\w\s]/g, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Trim whitespace
    .trim();

  // Remove common prefixes
  const prefixes = ['the ', 'a ', 'an ', 'dj ', 'mc ', 'lil '];
  for (const prefix of prefixes) {
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
  threshold = 0.85
): boolean {
  return artistNameSimilarity(name1, name2) >= threshold;
}
