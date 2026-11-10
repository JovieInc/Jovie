/**
 * The canonical desktop public profile is the Pen frame
 * "Public profile / Desktop ≥1180 — CANONICAL" (node D9kdx,
 * docs/pen-stills/golden-path/manifest.json), implemented by the wide
 * ProfileDesktopSurface dashboard. It ships by default (Tim, 2026-11-08:
 * the desktop IA redesign the 2026-09-26 flag was waiting for).
 *
 * Builds that must keep the 2026-09-26 mobile-first phone column opt out
 * with NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE=0 (or `false`, or an
 * empty value) at build time. NEXT_PUBLIC_ inlines the value into both the
 * server (ISR) render and the client bundle, so the rendered layout
 * contract and hydration always agree.
 */
export const PROFILE_DESKTOP_SURFACE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE !== '0' &&
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE !== 'false' &&
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE !== '';
