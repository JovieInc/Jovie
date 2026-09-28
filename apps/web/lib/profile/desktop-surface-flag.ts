/**
 * The public profile is mobile-first (Tim, 2026-09-26). Until the desktop IA
 * is redesigned, desktop visitors see the compact profile centered in a
 * phone-width column, and the wide ProfileDesktopSurface never mounts.
 *
 * Set NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE=1 (or `true`) at build time
 * to restore the desktop surface at >= 1180px. NEXT_PUBLIC_ inlines the value
 * into both the server (ISR) render and the client bundle, so the rendered
 * layout contract and hydration always agree.
 */
export const PROFILE_DESKTOP_SURFACE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE === '1' ||
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE === 'true';
