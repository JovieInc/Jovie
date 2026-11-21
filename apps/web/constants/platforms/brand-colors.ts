/**
 * Brand colours for marks that are not a platform in ALL_PLATFORMS.
 * Values are bare hex (no leading #), the same convention as `color` in
 * ./data.ts; callers add the # when they pass the colour through `style`.
 */

/** Official Google G, in the four fills Google's brand rules require. */
export const GOOGLE_BRAND_COLORS = {
  blue: '4285F4',
  green: '34A853',
  yellow: 'FBBC05',
  red: 'EA4335',
} as const;

/** Colour for a platform with no published brand colour (bare hex, no #). */
export const NEUTRAL_BRAND_FALLBACK_HEX = '6b7280';

/** Bare hex (no leading #) used for on-brand white icon contrast checks. */
export const ON_BRAND_WHITE_HEX = 'ffffff';
