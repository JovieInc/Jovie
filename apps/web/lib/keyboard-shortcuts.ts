import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Command,
  Home,
  IdCard,
  Keyboard,
  LogOut,
  MessageCircle,
  Music,
  PanelLeft,
  Search,
  Settings,
  UserCircle,
  Users,
} from 'lucide-react';

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
}

export type ShortcutCategory = 'general' | 'navigation' | 'actions';

/**
 * All keyboard shortcuts organized by category
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // General shortcuts
  {
    id: 'command-menu',
    label: 'Open command menu',
    keys: '⌘ K',
    category: 'general',
    icon: Command,
    shortcutKey: 'Meta+k',
  },
  {
    id: 'search',
    label: 'Open search',
    keys: '/',
    category: 'general',
    icon: Search,
    shortcutKey: '/',
  },
  {
    id: 'keyboard-shortcuts',
    label: 'View keyboard shortcuts',
    keys: '⌘ /',
    category: 'general',
    icon: Keyboard,
    shortcutKey: 'Meta+/',
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle sidebar',
    keys: '⌘ B',
    category: 'general',
    icon: PanelLeft,
    shortcutKey: 'Meta+b',
  },

  // Navigation shortcuts (G then letter)
  {
    id: 'nav-dashboard',
    label: 'Go to dashboard',
    keys: 'G then D',
    category: 'navigation',
    icon: Home,
    href: '/app',
    isSequential: true,
    firstKey: 'g',
    secondKey: 'd',
  },
  {
    id: 'nav-profile',
    label: 'Go to profile',
    keys: 'G then P',
    category: 'navigation',
    icon: UserCircle,
    href: '/app/dashboard/profile',
    isSequential: true,
    firstKey: 'g',
    secondKey: 'p',
  },
  {
    id: 'nav-contacts',
    label: 'Go to contacts',
    keys: 'G then C',
    category: 'navigation',
    icon: IdCard,
    href: '/app/dashboard/contacts',
    isSequential: true,
    firstKey: 'g',
    secondKey: 'c',
  },
  {
    id: 'nav-releases',
    label: 'Go to releases',
    keys: 'G then R',
    category: 'navigation',
    icon: Music,
    href: '/app/dashboard/releases',
    isSequential: true,
    firstKey: 'g',
    secondKey: 'r',
  },
  {
    id: 'nav-audience',
    label: 'Go to audience',
    keys: 'G then A',
    category: 'navigation',
    icon: Users,
    href: '/app/dashboard/audience',
    isSequential: true,
    firstKey: 'g',
    secondKey: 'a',
  },
  {
    id: 'nav-earnings',
    label: 'Go to earnings',
    keys: 'G then E',
    category: 'navigation',
    icon: Banknote,
    href: '/app/dashboard/earnings',
    isSequential: true,
    firstKey: 'g',
    secondKey: 'e',
  },
  {
    id: 'nav-chat',
    label: 'Go to chat',
    keys: 'G then T',
    category: 'navigation',
    icon: MessageCircle,
    href: '/app/dashboard/chat',
    isSequential: true,
    firstKey: 'g',
    secondKey: 't',
  },
  {
    id: 'nav-settings',
    label: 'Go to settings',
    keys: 'G then S',
    category: 'navigation',
    icon: Settings,
    href: '/app/settings',
    isSequential: true,
    firstKey: 'g',
    secondKey: 's',
  },

  // Action shortcuts
  {
    id: 'sign-out',
    label: 'Sign out',
    keys: '⌥ ⇧ Q',
    category: 'actions',
    icon: LogOut,
    shortcutKey: 'Alt+Shift+Q',
  },
];

/**
 * Map from nav item ID to shortcut for quick lookup
 */
export const NAV_SHORTCUTS: Record<string, KeyboardShortcut> = {
  overview: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-dashboard')!,
  links: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-profile')!,
  contacts: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-contacts')!,
  releases: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-releases')!,
  audience: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-audience')!,
  earnings: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-earnings')!,
  chat: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-chat')!,
  account: KEYBOARD_SHORTCUTS.find(s => s.id === 'nav-settings')!,
};

/**
 * Category labels for display
 */
export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: 'General',
  navigation: 'Navigation',
  actions: 'Actions',
};
