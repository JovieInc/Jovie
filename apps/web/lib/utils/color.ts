/**
 * Color utility functions for brand color handling and contrast calculations.
 * Used by link manager components for platform icon theming.
 */

/**
 * Convert a hex color string to RGB components.
 * @param hex - Hex color string (with or without #)
 * @returns Object with r, g, b values (0-255)
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const bigint = Number.parseInt(h, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

/**
 * Calculate the relative luminance of a color per WCAG 2.0.
 * @param hex - Hex color string
 * @returns Luminance value between 0 (black) and 1 (white)
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Determine if a brand color is considered "dark" for contrast purposes.
 * Dark brands (e.g., TikTok, X) need inverted icon colors in dark mode.
 * @param hex - Hex color string
 * @param threshold - Luminance threshold (default: 0.35)
 * @returns true if the color is dark
 */
export function isBrandDark(hex: string, threshold = 0.35): boolean {
  return relativeLuminance(hex) < threshold;
}

/**
 * Determine if a brand color is too bright for legible display on light surfaces.
 * Bright brands (e.g., Snapchat yellow, Deezer orange) need darkened icon colors
 * in light mode to meet WCAG 3:1 non-text contrast.
 * @param hex - Hex color string
 * @param bgHex - Background hex to check contrast against (default: #fcfcfc / surface-1)
 * @param minRatio - Minimum required contrast ratio (default: 3.0 for WCAG AA non-text)
 * @returns true if the brand color fails contrast on the given background
 */
export function isBrandTooLight(
  hex: string,
  bgHex = '#fcfcfc',
  minRatio = 3.0
): boolean {
  return contrastRatio(hex, bgHex) < minRatio;
}

/**
 * WCAG contrast ratio between two colors.
 * @returns ratio >= 1 (1 = identical, 21 = black vs white)
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Darken a hex color by a factor (0-1). factor=0.7 means 70% of original brightness.
 */
export function darkenHex(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = clamp(r * factor);
  const ng = clamp(g * factor);
  const nb = clamp(b * factor);
  return `#${((1 << 24) | (nr << 16) | (ng << 8) | nb).toString(16).slice(1)}`;
}

/**
 * Return a contrast-safe version of a brand color for the given background.
 * Progressively darkens the color until it meets the WCAG minimum ratio.
 * @param brandHex - Brand hex color (with or without #)
 * @param bgHex - Background hex color
 * @param minRatio - Minimum contrast ratio (default: 3.0)
 * @returns A hex color guaranteed to meet the contrast requirement
 */
export function ensureContrast(
  brandHex: string,
  bgHex: string,
  minRatio = 3.0
): string {
  const normalizedHex = brandHex.startsWith('#') ? brandHex : `#${brandHex}`;
  let color = normalizedHex;
  let factor = 1.0;
  // Iteratively darken; 20 steps is plenty to reach black from any color
  for (let i = 0; i < 20; i++) {
    if (contrastRatio(color, bgHex) >= minRatio) return color;
    factor -= 0.05;
    color = darkenHex(normalizedHex, factor);
  }
  return color;
}

/**
 * Get appropriate icon color and background for a brand color.
 * Handles dark mode inversion for very dark brands and ensures WCAG 3:1
 * non-text contrast for bright brands.
 * @param brandHex - Brand hex color
 * @param isDarkTheme - Whether the current theme is dark
 * @returns Object with iconColor and iconBg CSS values
 */
export function getBrandIconStyles(
  brandHex: string,
  isDarkTheme: boolean
): { iconColor: string; iconBg: string } {
  const iconColor = getContrastSafeIconColor(brandHex, isDarkTheme);

  // Determine background opacity based on theme and brand darkness
  const brandIsDark = isBrandDark(brandHex);
  let iconBg: string;
  if (!isDarkTheme) {
    iconBg = `${brandHex}15`;
  } else if (brandIsDark) {
    iconBg = 'rgba(255,255,255,0.08)';
  } else {
    iconBg = `${brandHex}20`;
  }

  return { iconColor, iconBg };
}

/**
 * Get a contrast-safe icon color for a brand against the current theme surface.
 * Inverts dark brands to white in dark mode; darkens bright brands in light mode.
 * @param brandHex - Brand hex color (with or without #)
 * @param isDarkTheme - Whether the current theme is dark
 * @returns Hex color that meets WCAG 3:1 non-text contrast
 */
export function getContrastSafeIconColor(
  brandHex: string,
  isDarkTheme: boolean
): string {
  if (isDarkTheme && isBrandDark(brandHex)) return '#ffffff';
  const bgHex = isDarkTheme ? '#101012' : '#fcfcfc';
  return ensureContrast(brandHex, bgHex);
}

/**
 * Choose white or dark text that meets WCAG 3:1 contrast on a brand-colored background.
 * Uses actual contrast ratio calculation instead of luminance threshold heuristic.
 * @param brandHex - Brand hex color used as background
 * @returns '#ffffff' or '#0f172a'
 */
export function getContrastTextOnBrand(brandHex: string): string {
  return contrastRatio('#ffffff', brandHex) >= 3 ? '#ffffff' : '#0f172a';
}

/**
 * Convert a hex color to rgba with specified alpha.
 * @param hex - Hex color string (with or without #)
 * @param alpha - Alpha value between 0 and 1
 * @returns rgba CSS string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
