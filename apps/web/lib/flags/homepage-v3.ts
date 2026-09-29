/**
 * Canonical Pen homepage v3 dark launch (Tim direction 2026-09-26).
 *
 * Build-time constant (same pattern as NEXT_PUBLIC_FEATURE_THEME_SWITCHING) so
 * `/` stays fully static. On by default since the identity + link-claim
 * homepage (Tim 2026-09-28); NEXT_PUBLIC_FEATURE_HOMEPAGE_V3=0 restores the
 * legacy story stack for rollback only.
 */
// ponytail: rollback switch; delete with the legacy story stack once v3 has baked.
export const HOMEPAGE_V3_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_HOMEPAGE_V3 !== '0' &&
  process.env.NEXT_PUBLIC_FEATURE_HOMEPAGE_V3 !== 'false';
