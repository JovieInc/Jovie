/**
 * Canonical z-index layering for public profile surfaces.
 *
 * Profile surfaces use a small, documented set of z-index layers so drawers,
 * overlays, and full-screen takeovers stack predictably regardless of which
 * component file mounts them. New profile UI must pick one of these layers
 * rather than introducing a new magic value.
 *
 * Spec ordering (low → high):
 *   1. Shell / in-flow content      — `z-auto` (default; tab bar lives here)
 *   2. Local stacking context       — `z-10`   (content within a card/panel)
 *   3. Sticky chrome inside panel   — `z-20`   (sticky headers in scrolling panels)
 *   4. Embedded preview modal       — `z-30`   (centered modal over preview iframe)
 *   5. Drawer backdrop              — `z-40`   (full-screen blurred backdrop)
 *   6. Drawer content + QR overlay  — `z-50`   (top-level standalone affordances)
 *   7. Full-screen mobile flow      — `z-[140]` (subscribe takeover above drawers)
 *
 * Tailwind v4 scans this file for class strings, so importing a value here is
 * equivalent (for JIT class generation) to writing the literal in the JSX.
 */

export const PROFILE_Z = {
  /** Default layer for content within a card/panel (most common). */
  LOCAL_CONTENT: 'z-10',
  /** Sticky chrome inside a scrolling panel (e.g. desktop drawer header). */
  STICKY_CHROME: 'z-20',
  /** Modal centered over an embedded preview surface. */
  EMBEDDED_MODAL: 'z-30',
  /** Full-screen backdrop behind drawer content. */
  DRAWER_BACKDROP: 'z-40',
  /** Drawer content and top-level affordances (e.g. QR overlay). */
  DRAWER_CONTENT: 'z-50',
  /**
   * Full-screen takeover that must sit above every drawer/overlay
   * (e.g. mobile notifications signup flow). Uses an arbitrary value
   * to leave headroom for app-level toasts/system UI above.
   */
  FULLSCREEN_FLOW: 'z-[140]',
} as const;

export type ProfileZLayer = (typeof PROFILE_Z)[keyof typeof PROFILE_Z];
