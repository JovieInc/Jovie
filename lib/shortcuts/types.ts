/**
 * Keyboard Shortcuts Framework Types
 * 
 * Centralized type definitions for the keyboard shortcuts system.
 * Follows Y Combinator principles: fast, simple, revenue-aligned.
 */

// Scope types - define where shortcuts are active
export type ShortcutScope = 'global' | 'page' | 'sheet' | 'modal';

// Handler function type
export type ShortcutHandler = (event: KeyboardEvent) => void | boolean;

// Individual shortcut definition
export interface Shortcut {
  id: string;
  combo: string | string[]; // e.g., 'cmd+1' or ['cmd+1', 'ctrl+1']
  description: string;
  handler: ShortcutHandler;
  scope: ShortcutScope;
  allowInInputs?: boolean; // Default false - ignore in input elements
  preventDefault?: boolean; // Default true
  stopPropagation?: boolean; // Default true
  category?: string; // For grouping in UI (e.g., 'navigation', 'actions')
}

// Registration for adding shortcuts to the registry
export interface ShortcutRegistration {
  shortcuts: Shortcut[];
  source: 'core' | 'sidebar' | 'feature'; // Track where shortcuts come from
}

// Configuration for dynamic sidebar shortcuts
export interface SidebarShortcutConfig {
  id: string;
  label: string;
  href: string;
  group: 'primary' | 'secondary' | 'utility';
  enabled: boolean;
  position?: number; // For explicit ordering
}

// Stable alias mappings for money-path shortcuts
export interface StableShortcutAlias {
  combo: string | string[];
  targetId: string; // ID of the navigation item
  description: string;
}

// Context for shortcut execution
export interface ShortcutContext {
  scope: ShortcutScope;
  activeModals: string[];
  currentRoute: string;
  inputFocused: boolean;
}

// Validation result for conflict detection
export interface ValidationResult {
  isValid: boolean;
  conflicts: ShortcutConflict[];
  warnings: ShortcutWarning[];
}

export interface ShortcutConflict {
  combo: string;
  shortcuts: Pick<Shortcut, 'id' | 'scope' | 'category'>[];
  severity: 'error' | 'warning';
}

export interface ShortcutWarning {
  type: 'reserved' | 'platform' | 'accessibility';
  combo: string;
  message: string;
}

// Provider props and context
export interface KeyboardShortcutsContextValue {
  registerShortcuts: (registration: ShortcutRegistration) => () => void;
  unregisterShortcuts: (source: string) => void;
  isShortcutActive: (id: string) => boolean;
  getActiveShortcuts: () => Shortcut[];
  validateShortcuts: (shortcuts: Shortcut[]) => ValidationResult;
}

export interface ShortcutScopeContextValue {
  currentScope: ShortcutScope;
  setScope: (scope: ShortcutScope) => void;
  pushScope: (scope: ShortcutScope) => void;
  popScope: () => void;
  scopeStack: ShortcutScope[];
}

// Visual hint configuration for UI components
export interface ShortcutHint {
  shortcut: Shortcut;
  displayCombo: string; // Platform-appropriate display (⌘1 vs Ctrl+1)
  position: 'badge' | 'tooltip' | 'aria-only';
}

// Platform detection
export type Platform = 'mac' | 'windows' | 'linux';

// Reserved shortcuts that should never be overridden
export const RESERVED_SHORTCUTS = [
  // Browser navigation
  'cmd+r', 'ctrl+r', // Reload
  'cmd+shift+r', 'ctrl+shift+r', // Hard reload
  'cmd+w', 'ctrl+w', // Close tab
  'cmd+t', 'ctrl+t', // New tab
  'cmd+shift+t', 'ctrl+shift+t', // Reopen tab
  'cmd+n', 'ctrl+n', // New window
  'cmd+shift+n', 'ctrl+shift+n', // New private window
  'cmd+l', 'ctrl+l', // Address bar
  'cmd+d', 'ctrl+d', // Bookmark
  
  // System shortcuts
  'cmd+c', 'ctrl+c', // Copy
  'cmd+v', 'ctrl+v', // Paste
  'cmd+x', 'ctrl+x', // Cut
  'cmd+z', 'ctrl+z', // Undo
  'cmd+shift+z', 'ctrl+shift+z', // Redo
  'cmd+a', 'ctrl+a', // Select all
  'cmd+f', 'ctrl+f', // Find
  'cmd+s', 'ctrl+s', // Save
  'cmd+p', 'ctrl+p', // Print
  
  // Accessibility
  'tab', 'shift+tab', // Focus navigation
  'enter', 'space', // Activation
  'escape', // Cancel/close
  'home', 'end', // Navigation
  'pageup', 'pagedown', // Navigation
] as const;

export type ReservedShortcut = typeof RESERVED_SHORTCUTS[number];