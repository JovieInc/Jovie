// Drawer rows read as list items, not buttons: no visible border/elevation at rest,
// subtle hover-only background + subtle rounding, brighter primary text.
// Keyboard focus gets a visible ring (WCAG 2.4.11 AA — 3:1 contrast) in
// addition to the background tint, since the native outline is suppressed.
export const PROFILE_DRAWER_MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-book text-white/92 transition-colors duration-150 ease-out hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset active:bg-white/[0.08]';

export const PROFILE_DRAWER_DANGER_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-book text-red-400/88 transition-colors duration-150 ease-out hover:bg-red-400/[0.06] focus-visible:bg-red-400/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-inset active:bg-red-400/[0.09]';

// Applied to non-focusable <div> wrappers; use focus-within so the ring
// appears when keyboard focus lands on an interactive child (link, Switch).
export const PROFILE_DRAWER_TOGGLE_ROW_CLASS =
  'flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-white/[0.04] focus-within:outline-none focus-within:ring-2 focus-within:ring-white/40 focus-within:ring-inset';

export const PROFILE_DRAWER_TITLE_CLASS = 'text-sm font-book text-white/92';

export const PROFILE_DRAWER_META_CLASS = 'text-2xs font-normal text-white/46';
