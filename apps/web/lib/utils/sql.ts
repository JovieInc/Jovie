/**
 * Escapes SQL LIKE/ILIKE pattern special characters.
 *
 * In PostgreSQL, `%` and `_` are wildcards, and `\` is the default escape
 * character. Escaping these characters allows safe literal matching when
 * constructing LIKE patterns such as `%${value}%`.
 */
export function escapeLikePattern(input: string): string {
  return input.replaceAll(/[%_\\]/g, char => `\\${char}`);
}
