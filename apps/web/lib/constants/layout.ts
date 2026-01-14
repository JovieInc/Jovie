/**
 * Layout Constants
 *
 * Shared layout constants used across table and sidebar components
 * to ensure consistent sizing and spacing throughout the application.
 */

/**
 * Standard sidebar width across all tables
 * Used by: Audience, Creators, Releases, Contact sidebars
 */
export const SIDEBAR_WIDTH = 320; // px

/**
 * Standard table row heights
 *
 * Different tables may use different row heights based on their content:
 * - COMPACT: High-density views (e.g., Audience CRM with many rows)
 * - STANDARD: Default for most tables
 * - TALL: Tables with multi-line content (e.g., Activity log with descriptions)
 */
export const TABLE_ROW_HEIGHTS = {
  COMPACT: 44, // Audience table (high-density exception)
  STANDARD: 52, // Default for most tables
  TALL: 60, // Activity table (multi-line content exception)
} as const;

/**
 * Table minimum widths by column count
 *
 * These values ensure tables remain readable and columns don't become too squished.
 * Choose the appropriate size based on your table's column count:
 * - SMALL: 4-5 columns (e.g., Activity table)
 * - MEDIUM: 6-8 columns (e.g., Audience, Creators tables)
 * - LARGE: 9+ columns (e.g., Waitlist table with many fields)
 */
export const TABLE_MIN_WIDTHS = {
  SMALL: 800, // 4-5 columns
  MEDIUM: 960, // 6-8 columns
  LARGE: 1100, // 9+ columns
} as const;
