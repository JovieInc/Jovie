// Backward-compat shim. All shortcut data now lives in keyboard-shortcuts.ts.
// Do not add new entries here. Migrate callers to import from keyboard-shortcuts.ts directly.

import { KEYBOARD_SHORTCUTS } from './keyboard-shortcuts';

export interface ShortcutHint {
  readonly keys: string;
  readonly description: string;
}

function makeHint(id: string): ShortcutHint {
  const s = KEYBOARD_SHORTCUTS.find(x => x.id === id);
  if (!s) throw new Error(`[shortcuts] Unknown shortcut id: ${id}`);
  return { keys: s.keys, description: s.description ?? s.label };
}

export const SHORTCUTS = {
  search: makeHint('command-menu'),
  searchSlash: makeHint('player-search-slash'),
  toggleSidebar: makeHint('player-toggle-sidebar'),
  toggleSidebarTab: makeHint('player-toggle-sidebar-tab'),
  toggleBar: makeHint('player-toggle-bar'),
  toggleBarAlt: makeHint('player-toggle-bar-alt'),
  toggleWaveform: makeHint('player-toggle-waveform'),
  toggleLyrics: makeHint('player-toggle-lyrics'),
  playPause: makeHint('player-play-pause'),
  jovieDictate: makeHint('player-dictate'),
  closeOverlay: makeHint('player-close-overlay'),
} as const satisfies Record<string, ShortcutHint>;

export type ShortcutKey = keyof typeof SHORTCUTS;

export function getShortcut(key: ShortcutKey): ShortcutHint {
  return SHORTCUTS[key];
}
