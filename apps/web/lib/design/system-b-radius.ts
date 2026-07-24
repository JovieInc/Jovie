/**
 * Pixel values of System B radius tokens from `styles/design-system.css`.
 *
 * Prefer CSS vars (`var(--radius-3xl)`) in stylesheets and Tailwind named
 * utilities (`rounded-3xl`, `rounded-full`). Use these numeric constants only
 * when a runtime animation API (Motion/WAAPI) requires a number or when a
 * shared geometry helper must return a resolved px value.
 *
 * Do **not** invent off-scale magic numbers (e.g. 28). Snap to the nearest
 * token and extend this map only when the CSS token scale itself changes.
 */
export const SYSTEM_B_RADIUS_PX = {
  none: 0,
  xs: 2,
  default: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  pill: 9999,
  full: 9999,
} as const;

export type SystemBRadiusToken = keyof typeof SYSTEM_B_RADIUS_PX;
