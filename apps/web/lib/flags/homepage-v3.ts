/**
 * Canonical Pen homepage v3 dark launch (Tim direction 2026-09-26).
 *
 * Build-time constant (same pattern as NEXT_PUBLIC_FEATURE_THEME_SWITCHING) so
 * `/` stays fully static. Off by default: the live homepage is unchanged until
 * the flip PR makes v3 the default and removes this flag. Set
 * NEXT_PUBLIC_FEATURE_HOMEPAGE_V3=1 at build time to preview v3.
 */
export const HOMEPAGE_V3_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_HOMEPAGE_V3 === '1' ||
  process.env.NEXT_PUBLIC_FEATURE_HOMEPAGE_V3 === 'true';
