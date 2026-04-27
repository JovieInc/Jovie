// Central registry of keyboard shortcuts surfaced via Tooltip's kbd chip.
// Symbols: `⌘K`, `⌥/`, `Hold ⌘J`, `[`, `Esc`. Use `⌘` not `Cmd`, `⌥`
// not `Alt`, for visual density.

export interface ShortcutHint {
  readonly keys: string;
  readonly description: string;
}

export const SHORTCUTS = {
  search: { keys: '⌘K', description: 'Open search / filter bar' },
  searchSlash: { keys: '/', description: 'Open search (no modifier)' },
  toggleSidebar: { keys: '[', description: 'Toggle sidebar dock / float' },
  toggleSidebarTab: { keys: 'Tab', description: 'Toggle sidebar dock / float' },
  toggleBar: { keys: '`', description: 'Toggle audio bar in / out' },
  toggleBarAlt: { keys: '⌘\\', description: 'Toggle audio bar (alt)' },
  toggleWaveform: { keys: 'W', description: 'Toggle waveform drawer' },
  toggleLyrics: { keys: 'L', description: 'Open / close the lyrics view' },
  playPause: { keys: 'Space', description: 'Play / pause current track' },
  jovieDictate: { keys: 'Hold ⌘J', description: 'Push-to-talk to Jovie' },
  closeOverlay: { keys: 'Esc', description: 'Close overlay / clear input' },
} as const satisfies Record<string, ShortcutHint>;

export type ShortcutKey = keyof typeof SHORTCUTS;

export function getShortcut(key: ShortcutKey): ShortcutHint {
  return SHORTCUTS[key];
}
