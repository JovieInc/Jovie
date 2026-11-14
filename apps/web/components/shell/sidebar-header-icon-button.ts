/**
 * One icon-button contract for the sidebar header row (bell, search, rail
 * toggle). Tim's 2026-11-14 screenshot showed three boxes: two 28px
 * rounded-md links with 16px glyphs next to a rounded-full IconButton with a
 * 14px glyph and a 44px pseudo hit target that overlapped its neighbours.
 *
 * Box and hit area are the same visible 28px square (WCAG 2.5.8 needs 24px),
 * glyphs use the shared sidebar icon token, and the row centers them on the
 * 28px logo line. Compose these; do not re-declare a private size.
 */

/** 28px square, rounded-md, themed focus ring, no oversized pseudo target. */
export const SIDEBAR_HEADER_ICON_BUTTON_CLASS =
  'focus-ring-themed relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-item-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent before:hidden';

/** Glyph size for every header control (16px, `--app-shell-sidebar-icon-size`). */
export const SIDEBAR_HEADER_ICON_CLASS =
  'size-(--app-shell-sidebar-icon-size) shrink-0';

/**
 * Space between header controls. The action cluster uses the gap and the
 * separately staged rail toggle uses the matching leading margin, so
 * bell -> search and search -> toggle read as one even rhythm.
 */
export const SIDEBAR_HEADER_ACTIONS_GAP_CLASS = 'gap-1';
export const SIDEBAR_HEADER_TOGGLE_LEAD_CLASS = 'ml-1';
