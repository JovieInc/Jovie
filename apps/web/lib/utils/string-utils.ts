/**
 * String utility functions for common string transformations.
 *
 * These utilities provide consistent string handling across the application,
 * eliminating duplicate normalization logic.
 */

/**
 * Normalize a string by trimming whitespace and converting to lowercase.
 * This is a common pattern used for case-insensitive string matching and storage.
 *
 * Handles null/undefined gracefully by returning empty string.
 *
 * @param value - String to normalize (null/undefined returns empty string)
 * @returns Normalized string (trimmed and lowercase)
 *
 * @example
 * ```ts
 * normalizeString('  Hello World  ') // 'hello world'
 * normalizeString('UPPERCASE') // 'uppercase'
 * normalizeString(null) // ''
 * normalizeString(undefined) // ''
 * normalizeString('') // ''
 * ```
 */
export function normalizeString(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Trim leading slashes from a path-like string.
 */
export function trimLeadingSlashes(value: string): string {
  if (!value) return '';
  let start = 0;
  while (start < value.length && value[start] === '/') {
    start += 1;
  }
  return value.slice(start);
}

/**
 * Trim trailing slashes from a path-like string.
 */
export function trimTrailingSlashes(value: string): string {
  if (!value) return '';
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Safely decode a URL-encoded string, handling common encoding formats.
 *
 * Decodes `%20` (percent-encoded spaces), `+` (form-encoded spaces), and other
 * percent-encoded characters. Returns the original string if decoding fails
 * (e.g., malformed encoding).
 *
 * @param value - String that may contain URL-encoded characters
 * @returns Decoded string, or original if already decoded or invalid encoding
 *
 * @example
 * ```ts
 * safeDecodeURIComponent('New%20York') // 'New York'
 * safeDecodeURIComponent('San+Francisco') // 'San Francisco'
 * safeDecodeURIComponent('Los Angeles') // 'Los Angeles' (no change)
 * safeDecodeURIComponent('%E2%9C%93') // '✓'
 * safeDecodeURIComponent('%invalid') // '%invalid' (returns original on error)
 * ```
 */
export function safeDecodeURIComponent(value: string): string {
  if (!value) return value;

  // Quick check: if no encoded characters, return as-is
  const maybeEncoded = value.includes('%') || value.includes('+');
  if (!maybeEncoded) return value;

  try {
    // Replace + with space (form encoding) then decode percent-encoding
    return decodeURIComponent(value.replaceAll('+', ' '));
  } catch {
    // Return original if decoding fails (malformed encoding)
    return value;
  }
}

/**
 * Format location parts (city, region, country) into a readable location string.
 *
 * Filters out null/undefined/empty values, decodes any URL-encoded strings,
 * and joins with commas.
 *
 * @param parts - Array of location components (city, region, country, etc.)
 * @returns Formatted location string, empty string if no valid parts
 *
 * @example
 * ```ts
 * formatLocationString(['New York', 'NY', 'US']) // 'New York, NY, US'
 * formatLocationString(['San%20Francisco', null, 'US']) // 'San Francisco, US'
 * formatLocationString([null, undefined, '']) // ''
 * ```
 */
export function formatLocationString(
  parts: Array<string | null | undefined>
): string {
  return (parts.filter(Boolean) as string[])
    .map(safeDecodeURIComponent)
    .join(', ');
}
