/**
 * Array utility functions for common array operations.
 *
 * These utilities provide consistent array handling across the application,
 * eliminating duplicate filtering and deduplication logic.
 */

/**
 * Get unique trimmed strings from an array, filtering out null/undefined/empty values.
 * Common pattern for cleaning and deduplicating user input arrays.
 *
 * @param values - Array of strings (can include null/undefined)
 * @returns Array of unique, trimmed, non-empty strings
 *
 * @example
 * ```ts
 * getUniqueTrimmedStrings(['  hello ', 'world', 'hello  ', null, ''])
 * // ['hello', 'world']
 *
 * getUniqueTrimmedStrings([undefined, '', '  ', 'test'])
 * // ['test']
 * ```
 */
export function getUniqueTrimmedStrings(
  values: (string | undefined | null)[]
): string[] {
  const cleaned = values.map(v => v?.trim()).filter((v): v is string => !!v);
  return Array.from(new Set(cleaned));
}
