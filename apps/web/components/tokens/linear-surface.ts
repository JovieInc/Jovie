/**
 * Shared app-card system matching the flatter app-shell direction.
 * Tier-1 content surfaces stay border-defined and flat, while sidebars,
 * drawers, and popovers retain the stronger floating treatment.
 */
export const LINEAR_SURFACE = {
  drawerCard: 'border-0 bg-transparent shadow-none',
  drawerCardSm: 'border-0 bg-transparent shadow-none',
  sidebarCard: 'border-0 bg-transparent shadow-none',
  contentContainer:
    'rounded-xl border border-(--linear-app-shell-border) bg-surface-1 shadow-none',
  bannerCard:
    'rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 shadow-none',
  dialogCard:
    'rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 shadow-none',
  stickyHeader:
    'border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',
  toolbar: 'border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',
  popover:
    'rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 p-0 shadow-[var(--shadow-popover)]',
} as const;

export const LINEAR_SURFACE_TIER = {
  drawerCard: 1,
  drawerCardSm: 1,
  sidebarCard: 1,
  contentContainer: 1,
  bannerCard: 1,
  dialogCard: 1,
  stickyHeader: 1,
  toolbar: 1,
  popover: 3,
} as const;

export type LinearSurface = keyof typeof LINEAR_SURFACE;
export type LinearSurfaceTier =
  (typeof LINEAR_SURFACE_TIER)[keyof typeof LINEAR_SURFACE_TIER];
