/**
 * 3-tier surface elevation system (verified against Linear.app/demo 2026-04-05).
 *
 * Tier 0 — Page bg / sidebar: bg-base / bg-surface-0 (no chrome)
 * Tier 1 — Main content area: bg-(--app-shell-content-surface), flat — the
 *   shell panel itself (AppShellFrame's <main>) owns the one rounded,
 *   borderless inset; nested content containers add no fill/border/shadow.
 * Tier 2 — Elevated cards: bg-surface-1 + border-subtle + shadow-card (10px radius)
 * Tier 3 — Floating UI: bg-surface-1 + shadow-popover
 *
 * In light mode, Tier 1 and Tier 2 share the same white bg.
 * Card elevation is expressed through the border ring + shadow, not bg color.
 * In dark mode, surface-1 (#101216) IS distinct from the content surface (#0a0c0f).
 */
export const LINEAR_SURFACE = {
  // Tier 1 — content containers inside <main>. Founder lock 2026-09-25:
  // <main> is the one rounded, borderless panel — route surfaces inside it
  // stay flat (no nested card fill/border/radius/shadow); the background
  // matches the shell panel exactly, so this is a layout wrapper only.
  contentContainer: 'bg-(--app-shell-content-surface) shadow-none',
  stickyHeader:
    'border-(--app-shell-frame-seam) bg-(--app-shell-content-surface)',
  toolbar: 'border-(--app-shell-frame-seam) bg-(--app-shell-content-surface)',

  // Tier 2 — elevated cards (drawer cards, standalone cards in content)
  // Drawer/sidebar cards: border-only, no shadow (they sit inside an already-elevated drawer).
  // shadow-card adds a ring + directional depth that clashes with the CSS border on stacked cards.
  drawerCard: 'rounded-lg border border-subtle bg-surface-1 shadow-none',
  drawerCardSm: 'rounded-lg border border-subtle bg-surface-1 shadow-none',
  sidebarCard: 'rounded-lg border border-subtle bg-surface-1 shadow-none',
  bannerCard: 'rounded-xl border border-subtle bg-surface-1 shadow-card',
  dialogCard: 'rounded-xl border border-subtle bg-surface-1 shadow-card',

  // Tier 3 — floating UI (popovers, dropdowns). Elevated token lifts above
  // content/card; shell remaps --color-bg-elevated for Noir Ion D.
  popover:
    'rounded-xl border border-subtle bg-surface-elevated p-0 shadow-(--shadow-popover)',
} as const;

export const LINEAR_SURFACE_TIER = {
  contentContainer: 1,
  stickyHeader: 1,
  toolbar: 1,
  drawerCard: 2,
  drawerCardSm: 2,
  sidebarCard: 2,
  bannerCard: 2,
  dialogCard: 2,
  popover: 3,
} as const;

export type LinearSurface = keyof typeof LINEAR_SURFACE;
export type LinearSurfaceTier =
  (typeof LINEAR_SURFACE_TIER)[keyof typeof LINEAR_SURFACE_TIER];
