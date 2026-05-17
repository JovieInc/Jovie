import type { LucideIcon } from 'lucide-react';
import {
  AudioLines,
  Banknote,
  CalendarDays,
  ChevronRight,
  Columns2,
  Command,
  Home,
  IdCard,
  Keyboard,
  LogOut,
  MessageCircle,
  Mic2,
  Music,
  PanelLeft,
  Play,
  Radio,
  Search,
  Settings,
  Sun,
  Type,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { APP_ROUTES } from '@/constants/routes';
// Unicode glyphs via String.fromCodePoint so they survive encoding-unaware
// pipelines (CI, bundlers, proxies) without producing mojibake.
export const GLYPH_CMD = String.fromCodePoint(0x2318);
export const GLYPH_OPT = String.fromCodePoint(0x2325);
export const GLYPH_SHIFT = String.fromCodePoint(0x21e7);
export const GLYPH_ARROW_RIGHT = String.fromCodePoint(0x2192);

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
    label: 'Search current view',
    keys: '/ in view',
    description: 'Open the active page search or filter surface',
    category: 'general',
    icon: Search,
    shortcutKey: '/',
    decision: {
      status: 'required',
      binding: 'ShellReleasesView, TasksPageClient, LibrarySurface',
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
    keys: `[ · ${GLYPH_CMD} B`,
    category: 'general',
    icon: PanelLeft,
    shortcutKey: '[',
    decision: { status: 'required', binding: 'useSidebarKeyboardShortcut' },
  },

  // Navigation shortcuts (G then letter)
  {
    id: 'nav-dashboard',
    label: 'Go to dashboard',
    keys: 'G then D',
    category: 'navigation',
    icon: Home,
    href: APP_ROUTES.DASHBOARD,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'd',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-profile',
    label: 'Go to profile',
    keys: 'G then P',
    category: 'navigation',
    icon: UserCircle,
    href: APP_ROUTES.CHAT,
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
    href: APP_ROUTES.SETTINGS_CONTACTS,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'c',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-releases',
    label: 'Go to releases',
    keys: 'G then R',
    category: 'navigation',
    icon: Music,
    href: APP_ROUTES.RELEASES,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'r',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-tour-dates',
    label: 'Go to tour dates',
    keys: 'G then O',
    category: 'navigation',
    icon: CalendarDays,
    href: APP_ROUTES.SETTINGS_TOURING,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'o',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-audience',
    label: 'Go to audience',
    keys: 'G then A',
    category: 'navigation',
    icon: Users,
    href: APP_ROUTES.AUDIENCE,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'a',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-earnings',
    label: 'Go to earnings',
    keys: 'G then E',
    category: 'navigation',
    icon: Banknote,
    href: APP_ROUTES.EARNINGS,
    isSequential: true,
    firstKey: 'g',
    secondKey: 'e',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-chat',
    label: 'Go to chat',
    keys: 'G then T',
    category: 'navigation',
    icon: MessageCircle,
    href: APP_ROUTES.CHAT,
    isSequential: true,
    firstKey: 'g',
    secondKey: 't',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },
  {
    id: 'nav-settings',
    label: 'Go to settings',
    keys: 'G then S',
    category: 'navigation',
    icon: Settings,
    href: APP_ROUTES.SETTINGS,
    isSequential: true,
    firstKey: 'g',
    secondKey: 's',
    decision: { status: 'required', binding: 'useSequentialShortcuts' },
  },

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
    id: 'player-search-slash',
    label: 'Search (player)',
    keys: '/',
    category: 'player',
    icon: Search,
    scope: 'player',
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

/**
 * Map from nav item ID to shortcut for quick lookup
 */
export const NAV_SHORTCUTS: Record<string, KeyboardShortcut> = {
  overview: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-dashboard')!,
  profile: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-profile')!,
  releases: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-releases')!,
  audience: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-audience')!,
  earnings: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-earnings')!,
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
