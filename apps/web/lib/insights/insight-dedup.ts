/**
 * Pure insight dedup helpers shared by server lifecycle queries and the
 * client chat analytics card. Keep this module free of DB / server imports.
 */

/**
 * Collapse near-identical insight titles that describe the same underlying
 * signal with slightly different growth callouts or punctuation.
 */
export function normalizeInsightTitleForDedup(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[-–—]\s*\d+(\.\d+)?\s*%?\s*(growth|increase|up)?\s*$/i, ' ')
    .replace(/\b\d+(\.\d+)?\s*%/g, ' ')
    .replace(/\b(growth|increase|boost)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
