/**
 * Canonical nav constants for the public profile bottom tab bar.
 *
 * These values drive shell padding (content scroll container) and tab bar
 * height calculations. They are consumed by:
 *   - BottomTabBar (rendering the bar itself)
 *   - ProfileCompactSurface (setting content bottom padding)
 *
 * Spec: docs/public-profile-surface-spec.md §2.6
 */

/**
 * Fixed height of the bottom tab bar, in rem.
 * Equates to 56px at the default 16px base font size.
 *
 * Used in content padding: `pb-[calc(TAB_BAR_HEIGHT_REM+env(safe-area-inset-bottom))]`
 * and in any layout calculation that needs the tab bar footprint.
 */
export const TAB_BAR_HEIGHT_REM = '3.5rem' as const;

/**
 * Canonical Tailwind padding class for content rendered below the tab bar.
 * Combines the fixed tab bar height with the device safe-area inset so content
 * is not obscured on iOS home-indicator or Android gesture-nav devices.
 *
 * Spec: docs/public-profile-surface-spec.md §2.6
 *
 * Usage:
 *   <div className={`min-h-0 flex-1 ${CONTENT_SAFE_AREA_BOTTOM_PADDING}`} />
 */
export const CONTENT_SAFE_AREA_BOTTOM_PADDING =
  'pb-[calc(3.5rem+env(safe-area-inset-bottom))]' as const;

/**
 * Minimum padding applied inside the tab bar below the nav items.
 * Falls back to 10px when `env(safe-area-inset-bottom)` is zero (non-notched devices).
 *
 * Applied as: `pb-[max(env(safe-area-inset-bottom),10px)]`
 */
export const TAB_BAR_INTERNAL_SAFE_AREA_MIN_PX = 10 as const;
