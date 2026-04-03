/**
 * Shared app-card system matching the flatter app-shell direction.
 * Tier-1 content surfaces stay border-defined and flat, while sidebars,
 * drawers, and popovers retain the stronger floating treatment.
 */
const elevatedSidebarCardShadow =
  'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_3px_8px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_3px_8px_-2px_rgba(0,0,0,0.22)]';

export const LINEAR_SURFACE = {
  drawerCard: `rounded-xl border border-(--linear-app-shell-border) bg-surface-1 ${elevatedSidebarCardShadow}`,
  drawerCardSm: `rounded-xl border border-(--linear-app-shell-border) bg-surface-1 ${elevatedSidebarCardShadow}`,
  sidebarCard: `rounded-xl border border-(--linear-app-shell-border) bg-surface-1 ${elevatedSidebarCardShadow}`,
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
  drawerCard: 2,
  drawerCardSm: 2,
  sidebarCard: 2,
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
