// Drawer rows read as list items, not buttons: no visible border/elevation at rest,
// subtle hover-only background + subtle rounding, brighter primary text.
// Keyboard focus gets a visible ring (WCAG 2.4.11 AA — 3:1 contrast) in
// addition to the background tint, since the native outline is suppressed.
export const PROFILE_DRAWER_MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-book text-primary-token transition-colors duration-subtle ease-subtle hover:bg-interactive-hover focus-visible:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset active:bg-interactive-active';

export const PROFILE_DRAWER_DANGER_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-book text-error transition-colors duration-subtle ease-subtle hover:bg-error-subtle focus-visible:bg-error-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-inset active:bg-error-subtle';

// Applied to non-focusable <div> wrappers; use focus-within so the ring
// appears when keyboard focus lands on an interactive child (link, Switch).
export const PROFILE_DRAWER_TOGGLE_ROW_CLASS =
  'flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors duration-subtle ease-subtle hover:bg-interactive-hover focus-within:outline-none focus-within:ring-2 focus-within:ring-focus focus-within:ring-inset';

export const PROFILE_DRAWER_TITLE_CLASS =
  'text-sm font-book text-primary-token';

export const PROFILE_DRAWER_META_CLASS =
  'text-2xs font-normal text-tertiary-token';
