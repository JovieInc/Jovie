/**
 * Dynamic Sidebar Shortcuts Builder
 * 
 * Builds keyboard shortcuts dynamically based on sidebar configuration.
 * Handles numeric shortcuts (⌘/Ctrl+1-9) and stable aliases.
 */

import { useRouter } from 'next/navigation';
import type { Shortcut, ShortcutRegistration } from './types';
import { 
  getPrimaryItems, 
  getItemByShortcutNumber, 
  STABLE_SHORTCUT_ALIASES, 
  getSidebarItem 
} from '../nav/sidebar';

/**
 * Build shortcuts from current sidebar configuration
 */
export function buildSidebarShortcuts(): ShortcutRegistration {
  const shortcuts: Shortcut[] = [];
  
  // Add numeric shortcuts for primary items (⌘/Ctrl+1-9)
  const primaryItems = getPrimaryItems();
  
  primaryItems.forEach((item, index) => {
    const number = index + 1;
    if (number <= 9) { // Only support 1-9
      shortcuts.push({
        id: `nav-${item.id}`,
        combo: [`cmd+${number}`, `ctrl+${number}`],
        description: `Go to ${item.name}`,
        handler: (event) => {
          event.preventDefault();
          window.location.href = item.href;
          return true;
        },
        scope: 'global',
        category: 'navigation',
        allowInInputs: false,
      });
    }
  });
  
  // Add stable aliases for money-path shortcuts
  STABLE_SHORTCUT_ALIASES.forEach(alias => {
    const targetItem = getSidebarItem(alias.targetId);
    if (targetItem && targetItem.enabled) {
      shortcuts.push({
        id: `alias-${alias.targetId}`,
        combo: alias.combo,
        description: alias.description,
        handler: (event) => {
          event.preventDefault();
          window.location.href = targetItem.href;
          return true;
        },
        scope: 'global',
        category: 'navigation',
        allowInInputs: false,
      });
    }
  });
  
  return {
    shortcuts,
    source: 'sidebar'
  };
}

/**
 * React hook to get sidebar shortcuts with navigation handler
 */
export function useSidebarShortcuts() {
  const router = useRouter();
  
  const shortcuts: Shortcut[] = [];
  
  // Add numeric shortcuts for primary items (⌘/Ctrl+1-9)
  const primaryItems = getPrimaryItems();
  
  primaryItems.forEach((item, index) => {
    const number = index + 1;
    if (number <= 9) { // Only support 1-9
      shortcuts.push({
        id: `nav-${item.id}`,
        combo: [`cmd+${number}`, `ctrl+${number}`],
        description: `Go to ${item.name}`,
        handler: (event) => {
          event.preventDefault();
          router.push(item.href);
          return true;
        },
        scope: 'global',
        category: 'navigation',
        allowInInputs: false,
      });
    }
  });
  
  // Add stable aliases for money-path shortcuts
  STABLE_SHORTCUT_ALIASES.forEach(alias => {
    const targetItem = getSidebarItem(alias.targetId);
    if (targetItem && targetItem.enabled) {
      shortcuts.push({
        id: `alias-${alias.targetId}`,
        combo: alias.combo,
        description: alias.description,
        handler: (event) => {
          event.preventDefault();
          router.push(targetItem.href);
          return true;
        },
        scope: 'global',
        category: 'navigation',
        allowInInputs: false,
      });
    }
  });
  
  return {
    shortcuts,
    source: 'sidebar' as const
  };
}

/**
 * Get shortcut hints for sidebar items
 */
export function getSidebarShortcutHints() {
  const hints: Array<{
    itemId: string;
    shortcut?: string;
    aliases: string[];
  }> = [];
  
  const primaryItems = getPrimaryItems();
  
  // Add hints for numeric shortcuts
  primaryItems.forEach((item, index) => {
    const number = index + 1;
    if (number <= 9) {
      const aliases: string[] = [];
      
      // Check for stable aliases
      STABLE_SHORTCUT_ALIASES.forEach(alias => {
        if (alias.targetId === item.id) {
          const aliasCombos = Array.isArray(alias.combo) ? alias.combo : [alias.combo];
          aliases.push(...aliasCombos);
        }
      });
      
      hints.push({
        itemId: item.id,
        shortcut: `⌘${number}`,
        aliases: aliases.map(combo => formatShortcutForDisplay(combo))
      });
    }
  });
  
  return hints;
}

/**
 * Format shortcut combo for display
 */
function formatShortcutForDisplay(combo: string): string {
  const isMac = typeof window !== 'undefined' && 
    window.navigator.platform.toLowerCase().includes('mac');
  
  return combo
    .replace(/cmd\+/g, isMac ? '⌘' : 'Ctrl+')
    .replace(/ctrl\+/g, isMac ? '⌃' : 'Ctrl+')
    .replace(/alt\+/g, isMac ? '⌥' : 'Alt+')
    .replace(/shift\+/g, isMac ? '⇧' : 'Shift+')
    .replace(/(\d)/, isMac ? '$1' : '$1');
}

/**
 * Check if a shortcut number maps to a valid navigation item
 */
export function isValidShortcutNumber(number: number): boolean {
  return number >= 1 && number <= 9 && getItemByShortcutNumber(number) !== null;
}

/**
 * Get all active navigation shortcuts (for help/debugging)
 */
export function getActiveNavigationShortcuts() {
  const primaryItems = getPrimaryItems();
  const shortcuts: Array<{
    combo: string;
    target: string;
    description: string;
    type: 'numeric' | 'alias';
  }> = [];
  
  // Numeric shortcuts
  primaryItems.forEach((item, index) => {
    const number = index + 1;
    if (number <= 9) {
      shortcuts.push({
        combo: `⌘${number}`,
        target: item.name,
        description: `Go to ${item.name}`,
        type: 'numeric'
      });
    }
  });
  
  // Stable aliases
  STABLE_SHORTCUT_ALIASES.forEach(alias => {
    const targetItem = getSidebarItem(alias.targetId);
    if (targetItem && targetItem.enabled) {
      const aliasCombos = Array.isArray(alias.combo) ? alias.combo : [alias.combo];
      aliasCombos.forEach(combo => {
        shortcuts.push({
          combo: formatShortcutForDisplay(combo),
          target: targetItem.name,
          description: alias.description,
          type: 'alias'
        });
      });
    }
  });
  
  return shortcuts;
}