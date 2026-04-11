/**
 * 3-tier surface elevation system (verified against Linear.app/demo 2026-04-05).
 *
 * Tier 0 — Page bg / sidebar: bg-base / bg-surface-0 (no chrome)
 * Tier 1 — Main content area: bg-(--linear-app-content-surface) (shell border + shadow)
 * Tier 2 — Elevated cards: bg-surface-1 + border-subtle + shadow-card (10px radius)
 * Tier 3 — Floating UI: bg-surface-1 + shadow-popover
 *
 * In light mode, Tier 1 and Tier 2 share the same white bg.
 * Card elevation is expressed through the border ring + shadow, not bg color.
 * In dark mode, surface-1 (#17171a) IS distinct from the content surface (#0f1011).
 */
export const LINEAR_SURFACE = {
  // Tier 1 — content containers inside <main>
  contentContainer:
    'rounded-xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-none',
  stickyHeader:
    'border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',
  toolbar: 'border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',

  // Tier 2 — elevated cards (drawer cards, standalone cards in content)
  // Drawer/sidebar cards: border-only, no shadow (they sit inside an already-elevated drawer).
  // shadow-card adds a ring + directional depth that clashes with the CSS border on stacked cards.
  drawerCard: 'rounded-[10px] border border-subtle bg-surface-1 shadow-none',
  drawerCardSm: 'rounded-[10px] border border-subtle bg-surface-1 shadow-none',
  sidebarCard: 'rounded-[10px] border border-subtle bg-surface-1 shadow-none',
  bannerCard: 'rounded-xl border border-subtle bg-surface-1 shadow-card',
  dialogCard: 'rounded-xl border border-subtle bg-surface-1 shadow-card',

  // Tier 3 — floating UI (popovers, dropdowns)
  popover:
    'rounded-xl border border-subtle bg-surface-1 p-0 shadow-[var(--shadow-popover)]',
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
