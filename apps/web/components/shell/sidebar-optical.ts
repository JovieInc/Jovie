/**
 * Shared sidebar optical column.
 *
 * Brand, nav icons, history titles, and footer identity share one inset.
 * Call sites compose these classes. They do not add a private px/gap/grid.
 *
 * Column: 12px inset, 16px icon, 8px gap, 28px row. History reuses the nav
 * tracks, so a real icon slot keeps titles on the label column.
 */

export const SIDEBAR_ENTRY_ROW_CLASS =
  'h-(--app-shell-sidebar-row-height) w-full gap-x-(--app-shell-sidebar-icon-gap) px-(--app-shell-sidebar-inset) grid-cols-(--app-shell-sidebar-nav-grid)';

export const SIDEBAR_ENTRY_ICON_SLOT_CLASS =
  'grid size-(--app-shell-sidebar-icon-size) shrink-0 place-items-center justify-self-center';

export const SIDEBAR_ENTRY_LABEL_INSET_CLASS =
  'ps-(--app-shell-sidebar-label-inset) pe-(--app-shell-sidebar-inset)';
