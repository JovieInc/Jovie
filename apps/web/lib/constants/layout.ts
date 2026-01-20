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
 * All tables now use COMPACT (44px) as the standard for visual consistency.
 * - COMPACT/STANDARD: 44px - unified row height for all tables
 * - TALL: 60px - deprecated, kept for backwards compatibility
 */
export const TABLE_ROW_HEIGHTS = {
  COMPACT: 44, // Unified standard row height
  STANDARD: 44, // Same as COMPACT - all tables use 44px
  TALL: 60, // Deprecated - remove after full migration
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
 * Release table width calculation constants
 *
 * Base width covers fixed columns: Release(220) + Released(70) + SmartLink(180) + Actions(60)
 * Provider width is added per dynamic provider column
 */
export const RELEASE_TABLE_WIDTHS = {
  BASE: 530, // Fixed columns total width
  PROVIDER_COLUMN: 100, // Width per provider column
} as const;
