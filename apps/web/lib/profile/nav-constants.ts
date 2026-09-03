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
 * Fixed height of the bottom tab bar material, in rem.
 * Equates to 56px at the default 16px base font size.
 *
 * Used in content padding via `--profile-bottom-nav-height`.
 * and in any layout calculation that needs the tab bar footprint.
 */
export const TAB_BAR_HEIGHT_REM = '3.5rem' as const;

/**
 * Canonical Tailwind padding class for content rendered below the tab bar.
 * `--profile-bottom-nav-height` owns the real inset: bar height, safe-area,
 * and extra `--space-8` so the last Music row stays tappable.
 *
 * Spec: docs/public-profile-surface-spec.md §2.6
 *
 * Usage:
 *   <div className={`min-h-0 flex-1 ${CONTENT_SAFE_AREA_BOTTOM_PADDING}`} />
 */
export const CONTENT_SAFE_AREA_BOTTOM_PADDING =
  'pb-[var(--profile-bottom-nav-height)]' as const;

/**
 * Minimum padding applied inside the tab bar below the nav items.
 * Falls back to 10px when `env(safe-area-inset-bottom)` is zero (non-notched devices).
 *
 * Applied as: `pb-[max(env(safe-area-inset-bottom),10px)]`
 */
export const TAB_BAR_INTERNAL_SAFE_AREA_MIN_PX = 10 as const;

/**
 * Canonical padding class for the bottom tab bar's internal safe-area inset.
 * Keep this literal so Tailwind can statically discover the arbitrary class.
 */
export const TAB_BAR_INTERNAL_SAFE_AREA_PADDING =
  'pb-[max(env(safe-area-inset-bottom),10px)]' as const;
