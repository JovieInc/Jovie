import type { LucideIcon } from 'lucide-react';
import {
  AudioLines,
  CalendarDays,
  ChevronRight,
  Columns2,
  Command,
  Home,
  IdCard,
  Keyboard,
  Layers,
  Link2,
  Lock,
  LogOut,
  MessageCircle,
  Mic2,
  PanelLeft,
  PanelRight,
  Paperclip,
  Play,
  Radio,
  Repeat2,
  Search,
  Settings,
  Sun,
  Type,
  UserCircle,
  X,
} from 'lucide-react';
import { APP_ROUTES } from '@/constants/routes';
import { COMMANDS } from '@/lib/commands/registry';
// Unicode glyphs via String.fromCodePoint so they survive encoding-unaware
// pipelines (CI, bundlers, proxies) without producing mojibake.
export const GLYPH_CMD = String.fromCodePoint(0x2318);
export const GLYPH_OPT = String.fromCodePoint(0x2325);
export const GLYPH_SHIFT = String.fromCodePoint(0x21e7);
export const GLYPH_ARROW_RIGHT = String.fromCodePoint(0x2192);
export const WORKSPACE_SWITCH_KEY = 'w';
export const WORKSPACE_SWITCH_SHORTCUT_KEY = 'Alt+Shift+w';
export const FOUNDER_DOOR_SHORTCUT_KEY = 'Meta+o';

/**
 * Shipping gate — every shortcut must declare its status before merge.
 * `required` means the shortcut is wired and tested; `binding` names the handler.
 * `deferred` means intentionally not wired globally yet (e.g. desktop-only, needs conflict testing).
 * `none` means no shortcut was the deliberate product decision.
 */
export type ShortcutDecision =
  | { status: 'required'; binding: string }
  | { status: 'deferred'; reason: string }
  | { status: 'none'; reason: string };

/**
 * Where the shortcut fires.
 * `global` = fires from anywhere in the shell.
 * `player` = fires only when the audio player surface owns focus.
 * `overlay` = fires only when a modal/overlay is active.
 */
export type ShortcutScope = 'global' | 'player' | 'overlay';

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  /** Unique identifier for the shortcut */
  id: string;
  /** Human-readable label */
  label: string;
  /** Display format for the shortcut keys (e.g., "G then D") */
  keys: string;
  /** Optional description */
  description?: string;
  /** Category for grouping in the shortcuts modal */
  category: ShortcutCategory;
  /** Icon to display */
  icon?: LucideIcon;
  /** Existing command owner when this is a projection of a menu action. */
  commandId?: string;
  /** Navigation href (for nav shortcuts) */
  href?: string;
  /** Whether this is a sequential shortcut (e.g., G then D) */
  isSequential?: boolean;
  /** First key in sequence (e.g., 'g') */
  firstKey?: string;
  /** Second key in sequence (e.g., 'd') */
  secondKey?: string;
  /** Single key with modifiers (e.g., 'Meta+/') for non-sequential shortcuts */
  shortcutKey?: string;
  /** Shipping gate: every shortcut must declare required | deferred | none */
  decision: ShortcutDecision;
  /** Where this shortcut fires; omit for 'global' (the default) */
  scope?: ShortcutScope;
}

export type ShortcutCategory = 'general' | 'navigation' | 'actions' | 'player';

/**
 * Admin-only workspace binding metadata. This intentionally stays outside the
 * public shortcut catalog so non-admin help surfaces cannot reveal OV.
 */
export const WORKSPACE_SWITCH_SHORTCUT: KeyboardShortcut = {
  id: 'switch-workspace',
  label: 'Switch workspace',
  keys: `${GLYPH_OPT} ${GLYPH_SHIFT} W`,
  description: 'Switch the active workspace',
  category: 'actions',
  shortcutKey: WORKSPACE_SWITCH_SHORTCUT_KEY,
  decision: { status: 'required', binding: 'useGlobalShortcutActions' },
};

/**
 * Admin-only founder-door binding. Stays outside the public shortcut catalog
 * so customer help surfaces never reveal Ovie.
 */
export const FOUNDER_DOOR_SHORTCUT: KeyboardShortcut = {
  id: 'toggle-founder-door',
  label: 'Toggle Ovie / Jovie',
  keys: `${GLYPH_CMD} O`,
  description: 'Switch the founder door between Ovie and Jovie',
  category: 'actions',
  icon: Repeat2,
  shortcutKey: FOUNDER_DOOR_SHORTCUT_KEY,
  decision: { status: 'required', binding: 'useGlobalShortcutActions' },
};

/** Project existing navigation actions; routes, names, and hints have one owner. */
function commandShortcut(
  commandId: string,
  icon: LucideIcon
): KeyboardShortcut {
  const command = COMMANDS.find(entry => entry.id === commandId);
  if (command?.kind !== 'nav' || !command.keyboardShortcut) {
    throw new Error(`Unresolved keyboard command: ${commandId}`);
  }
  return {
    ...command.keyboardShortcut,
    commandId: command.id,
    label: `Go to ${command.label.toLowerCase()}`,
    keys: `${command.keyboardShortcut.firstKey.toUpperCase()} then ${command.keyboardShortcut.secondKey.toUpperCase()}`,
    category: 'navigation',
    icon,
    href: command.href,
    isSequential: true,
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  };
}

/**
 * All keyboard shortcuts organized by category
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // General shortcuts
  {
    id: 'command-menu',
    label: 'Open command menu',
    keys: `${GLYPH_CMD} K`,
    category: 'general',
    icon: Command,
    shortcutKey: 'Meta+k',
    decision: { status: 'required', binding: 'CommandPalette.tsx' },
  },
  {
    id: 'current-view-search',
    label: 'Search Jovie',
    keys: '/',
    description: 'Focus the persistent app search in the header',
    category: 'general',
    icon: Search,
    shortcutKey: '/',
    decision: {
      status: 'required',
      binding: 'HeaderActionsProvider, HeaderSearchSurface',
    },
  },
  {
    id: 'keyboard-shortcuts',
    label: 'View keyboard shortcuts',
    keys: `${GLYPH_CMD} / · ?`,
    category: 'general',
    icon: Keyboard,
    shortcutKey: 'Meta+/',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle sidebar',
    keys: `${GLYPH_CMD} B · [`,
    category: 'general',
    icon: PanelLeft,
    shortcutKey: 'Meta+b',
    decision: { status: 'required', binding: 'useSidebarKeyboardShortcut' },
  },
  {
    id: 'toggle-right-rail',
    label: 'Toggle right rail',
    keys: ']',
    category: 'general',
    icon: PanelRight,
    decision: { status: 'required', binding: 'useRightRailKeyboardShortcut' },
  },

  // Navigation shortcuts (G then letter)
  // Sidebar order first: Home, then Work.
  commandShortcut('go-home', Home),
  commandShortcut('go-work', Layers),
  {
    id: 'nav-profile',
    label: 'Go to profile',
    keys: 'G then P',
    category: 'navigation',
    icon: UserCircle,
    href: APP_ROUTES.SETTINGS_PROFILE,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'p',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-contacts',
    label: 'Go to contacts',
    keys: 'G then C',
    category: 'navigation',
    icon: IdCard,
    href: APP_ROUTES.CONTACTS,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'c',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  commandShortcut('go-links', Link2),
  commandShortcut('go-calendar', CalendarDays),
  commandShortcut('go-tour-dates', CalendarDays),
  {
    id: 'nav-chat',
    label: 'Go to conversation',
    keys: 'G then T',
    category: 'navigation',
    icon: MessageCircle,
    href: APP_ROUTES.CHAT,
    isSequential: true,
    firstKey: 'g',
    secondKey: 't',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  commandShortcut('go-settings', Settings),

  // Action shortcuts
  {
    id: 'toggle-theme',
    label: 'Toggle theme',
    keys: `${GLYPH_OPT} T`,
    category: 'actions',
    icon: Sun,
    shortcutKey: 'Alt+t',
    decision: { status: 'required', binding: 'useGlobalShortcutActions' },
  },
  {
    id: 'lock-workspace',
    label: 'Lock workspace',
    keys: `${GLYPH_OPT} ${GLYPH_SHIFT} L`,
    description: 'Lock the workspace until a passkey unlocks it',
    category: 'actions',
    icon: Lock,
    shortcutKey: 'Alt+Shift+L',
    decision: { status: 'required', binding: 'useGlobalShortcutActions' },
  },
  {
    id: 'attach-file',
    label: 'Attach file',
    keys: `${GLYPH_CMD} U`,
    description: 'Attach any file to the open work; Jovie detects the type',
    category: 'actions',
    icon: Paperclip,
    shortcutKey: 'Meta+u',
    decision: { status: 'required', binding: 'LibrarySurface AssetDrawer' },
  },
  {
    id: 'sign-out',
    label: 'Sign out',
    keys: `${GLYPH_OPT} ${GLYPH_SHIFT} Q`,
    category: 'actions',
    icon: LogOut,
    shortcutKey: 'Alt+Shift+Q',
    decision: { status: 'required', binding: 'useGlobalShortcutActions' },
  },
  // Player shortcuts — scope: 'player' means only fires when audio player has focus.
  // Bare single-key shortcuts here are intentional and safe in that scoped context.
  {
    id: 'player-play-pause',
    label: 'Play / Pause',
    keys: 'Space',
    category: 'player',
    icon: Play,
    scope: 'player',
    decision: { status: 'required', binding: 'AudioBar' },
  },
  {
    id: 'player-toggle-waveform',
    label: 'Toggle waveform',
    keys: 'W',
    category: 'player',
    icon: AudioLines,
    scope: 'player',
    decision: { status: 'required', binding: 'AudioBar' },
  },
  {
    id: 'player-toggle-lyrics',
    label: 'Toggle lyrics',
    keys: 'L',
    category: 'player',
    icon: Type,
    scope: 'player',
    decision: { status: 'required', binding: 'AudioBar' },
  },
  {
    id: 'player-toggle-bar',
    label: 'Toggle audio bar',
    keys: '`',
    category: 'player',
    icon: Radio,
    shortcutKey: '`',
    scope: 'global',
    decision: { status: 'required', binding: 'AudioBar' },
  },
  {
    id: 'player-toggle-bar-alt',
    label: 'Toggle audio bar (alt)',
    keys: `${GLYPH_CMD} \\`,
    category: 'player',
    icon: Radio,
    shortcutKey: 'Meta+\\',
    scope: 'global',
    decision: { status: 'required', binding: 'AudioBar' },
  },
  {
    id: 'player-toggle-sidebar',
    label: 'Toggle sidebar dock',
    keys: '[',
    category: 'player',
    icon: Columns2,
    scope: 'player',
    decision: { status: 'required', binding: 'AudioBar' },
  },
  {
    id: 'player-toggle-sidebar-tab',
    label: 'Cycle sidebar tab',
    keys: 'Tab',
    category: 'player',
    icon: ChevronRight,
    scope: 'player',
    decision: { status: 'required', binding: 'AudioBar' },
  },
  {
    id: 'player-dictate',
    label: 'Push-to-talk to Jovie',
    keys: `Hold ${GLYPH_CMD} J`,
    category: 'player',
    icon: Mic2,
    scope: 'global',
    decision: {
      status: 'deferred',
      reason:
        'Desktop-first; browser conflict testing pending before global default',
    },
  },
  {
    id: 'player-close-overlay',
    label: 'Close overlay',
    keys: 'Esc',
    category: 'player',
    icon: X,
    scope: 'overlay',
    decision: { status: 'required', binding: 'ContextMenuOverlay' },
  },
];

export function shortcutsForHelpSheet(options: {
  readonly canUseFounderDoor: boolean;
}): readonly KeyboardShortcut[] {
  if (!options.canUseFounderDoor) return KEYBOARD_SHORTCUTS;
  return [...KEYBOARD_SHORTCUTS, FOUNDER_DOOR_SHORTCUT];
}

/**
 * Map from nav item ID to shortcut for quick lookup
 */
export const NAV_SHORTCUTS: Record<string, KeyboardShortcut> = {
  home: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-dashboard')!,
  overview: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-dashboard')!,
  profile: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-profile')!,
  'artist-profile': KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-profile')!,
  releases: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-releases')!,
  library: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-releases')!,
  links: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-links')!,
  calendar: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-calendar')!,
  chat: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-chat')!,
  account: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-settings')!,
  contacts: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-contacts')!,
  touring: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-tour-dates')!,
};

/**
 * Category labels for display
 */
export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: 'General',
  navigation: 'Navigation',
  actions: 'Actions',
  player: 'Player',
};
