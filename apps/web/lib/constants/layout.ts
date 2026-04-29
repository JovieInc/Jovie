/**
 * Layout Constants
 *
 * Shared layout constants used across table and sidebar components
 * to ensure consistent sizing and spacing throughout the application.
 */

/**
 * Standard desktop details-lane width across most entity panels.
 * Release detail uses a slightly wider override for artwork and metadata density.
 */
export const SIDEBAR_WIDTH = 360; // px

/**
 * Standard table row heights — unified 40px baseline across all tables.
 */
export const TABLE_ROW_HEIGHTS = {
  COMPACT: 40,
  STANDARD: 40,
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

/**
 * Skeleton row count for loading shells.
 *
 * Sized to fill the tallest common viewport (1440px minus shell chrome)
 * so the skeleton always covers the visible area with no gap at the bottom.
 * The overflow-hidden on the table container clips any excess rows.
 * Using a single generous count avoids layout shift when real data lands.
 */
export const SKELETON_ROW_COUNT = {
  /** Desktop table rows — 10 rows fills standard viewport without skeleton overload */
  TABLE: 10,
  /** Mobile card rows (taller cards → fewer needed) */
  MOBILE: 16,
} as const;

/**
 * Release table width calculation constants
 *
 * Base width covers fixed columns: Checkbox(56) + Release(min 200) + Meta(min 200)
 * Provider width is added per dynamic provider column
 */
export const RELEASE_TABLE_WIDTHS = {
  BASE: 56 + 200 + 200, // Checkbox + Release min + Meta min
  PROVIDER_COLUMN: 100, // Width per provider column
} as const;
