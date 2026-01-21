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
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}
