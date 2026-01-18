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
 * Get appropriate icon color and background for a brand color.
 * Handles dark mode inversion for very dark brands.
 * @param brandHex - Brand hex color
 * @param isDarkTheme - Whether the current theme is dark
 * @returns Object with iconColor and iconBg CSS values
 */
export function getBrandIconStyles(
  brandHex: string,
  isDarkTheme: boolean
): { iconColor: string; iconBg: string } {
  const brandIsDark = isBrandDark(brandHex);

  // In dark theme, invert very dark brands (e.g., X, TikTok) to white for legibility
  const iconColor = isDarkTheme && brandIsDark ? '#ffffff' : brandHex;
  const iconBg = isDarkTheme
    ? brandIsDark
      ? 'rgba(255,255,255,0.08)'
      : `${brandHex}20`
    : `${brandHex}15`;

  return { iconColor, iconBg };
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
