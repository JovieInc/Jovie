/**
 * Inset panel geometry: the menu surface as a static panel.
 *
 * One optical contract shared by floating menus (`dropdown-styles.ts`) and
 * in-flow panels such as the sidebar footer cards, so a menu and a panel that
 * sit next to each other line up exactly:
 *
 * - The surface insets its rows by `p-1` on every side; rows use the matching
 *   concentric inner radius.
 * - Every row is 32px tall and starts on one gutter (10px, the menu row inset).
 * - Every icon sits in one fixed 16px column; every label starts on one edge
 *   (gutter + icon column + `gap-2`).
 * - Trailing content (shortcut, count, icon) is right-aligned and muted.
 * - Section labels and header meta are muted and start on the same gutter.
 *
 * The values deliberately mirror MENU_ITEM_BASE / MENU_LEADING_SLOT_BASE /
 * MENU_TRAILING_SLOT_BASE. Change them together.
 */
import {
  MENU_LEADING_SLOT_BASE,
  MENU_TRAILING_SLOT_BASE,
  OVERLAY_CONTENT_RADIUS,
  OVERLAY_ITEM_FOCUS,
  OVERLAY_ITEM_RADIUS,
} from './dropdown-styles';

/** Horizontal gutter every direct child of the surface starts on. */
export const INSET_PANEL_GUTTER = 'px-(--space-2-5)';

/** Panel chrome: even inset, soft concentric corners, hairline border. */
export const INSET_PANEL_SURFACE = `min-w-0 max-w-full ${OVERLAY_CONTENT_RADIUS} border border-subtle bg-surface-elevated p-1 text-primary-token`;

/**
 * Subtle ion wash over the elevated surface. Both stops are design tokens;
 * primary, secondary and tertiary text clear 4.5:1 on the strongest stop in
 * light and dark (see inset-panel contrast test).
 */
export const INSET_PANEL_GRADIENT =
  'bg-linear-to-br from-accent-subtle to-transparent';

/** Row geometry without interaction states. */
export const INSET_PANEL_ROW_LAYOUT = `flex h-8 min-w-0 items-center gap-2 ${OVERLAY_ITEM_RADIUS} ${INSET_PANEL_GUTTER} text-app leading-5 text-secondary-token`;

/** Hover / focus treatment for a row that is itself the control. */
export const INSET_PANEL_ROW_INTERACTIVE =
  'w-full cursor-default select-none text-start outline-none transition-colors duration-fast ease-interactive ' +
  'hover:bg-surface-1 hover:text-primary-token ' +
  `${OVERLAY_ITEM_FOCUS} focus-visible:text-primary-token ` +
  'disabled:pointer-events-none disabled:opacity-50';

/** The single icon column. Larger marks (avatars) centre on it. */
export const INSET_PANEL_ICON_COLUMN = `${MENU_LEADING_SLOT_BASE} [&_svg]:size-4`;

/** Label column: one left edge, truncates before the trailing slot. */
export const INSET_PANEL_LABEL = 'min-w-0 flex-1 truncate';

/** Right-aligned, muted trailing slot. */
export const INSET_PANEL_TRAILING = `${MENU_TRAILING_SLOT_BASE} text-2xs tabular-nums [&_svg]:size-4`;

/** Header row: title on the gutter, optional muted meta on the right. */
export const INSET_PANEL_HEADER = `flex h-8 min-w-0 items-center justify-between gap-2 ${INSET_PANEL_GUTTER}`;

export const INSET_PANEL_TITLE =
  'min-w-0 truncate text-app font-medium leading-5 text-primary-token';

export const INSET_PANEL_META =
  'shrink-0 text-2xs tabular-nums text-tertiary-token';

/** Muted section label on the same gutter and row rhythm. */
export const INSET_PANEL_SECTION_LABEL = `flex h-8 min-w-0 items-center ${INSET_PANEL_GUTTER} text-2xs font-medium leading-4 text-tertiary-token`;

/** Restrained hairline that stops at the gutter instead of bleeding out. */
export const INSET_PANEL_SEPARATOR =
  'mx-(--space-2-5) my-1 h-px border-0 bg-subtle';

/** Full-inner-width progress track region. */
export const INSET_PANEL_PROGRESS = `${INSET_PANEL_GUTTER} pb-2 pt-1`;
