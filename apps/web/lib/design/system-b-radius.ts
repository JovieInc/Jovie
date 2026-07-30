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

/**
 * Shared inset distances that participate in System B's concentric-surface
 * rule. These values intentionally mirror `--space-*` in design-system.css.
 */
export const SYSTEM_B_SURFACE_INSET_PX = {
  1: 4,
} as const;

/**
 * System B surface geometry.
 *
 * When one rounded surface is inset inside another, the outer radius must
 * equal the inner radius plus the inset. This keeps the two corner arcs
 * concentric instead of making nested cards and overlay rows look misaligned.
 *
 * Use the CSS aliases with the same names in `styles/design-system.css` for
 * classes. This typed representation exists for geometry helpers and tests.
 */
export const SYSTEM_B_CONCENTRIC_SURFACES = {
  card: {
    outer: 'xl',
    inner: 'lg',
    inset: 1,
  },
  overlay: {
    outer: 'xl',
    inner: 'lg',
    inset: 1,
  },
  panel: {
    outer: '3xl',
    inner: '2xl',
    inset: 1,
  },
} as const satisfies Record<
  string,
  {
    readonly outer: SystemBRadiusToken;
    readonly inner: SystemBRadiusToken;
    readonly inset: keyof typeof SYSTEM_B_SURFACE_INSET_PX;
  }
>;
