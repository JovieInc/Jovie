/**
 * Sidebar Navigation Configuration
 * 
 * Single source of truth for sidebar items and their keyboard shortcuts.
 * This replaces the separate navigation arrays and provides unified config.
 */

import {
  BanknotesIcon,
  ChartPieIcon,
  Cog6ToothIcon,
  HomeIcon,
  LinkIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { SidebarShortcutConfig, StableShortcutAlias } from '../shortcuts/types';

export interface SidebarItem extends SidebarShortcutConfig {
  name: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
  isPro?: boolean;
}

/**
 * Complete sidebar configuration
 * This is the single source of truth for both rendering and shortcuts
 */
export const SIDEBAR_ITEMS: SidebarItem[] = [
  // Primary navigation - Core features (⌘/Ctrl+1-4)
  {
    id: 'overview',
    name: 'Overview',
    label: 'Overview',
    href: '/dashboard/overview',
    icon: HomeIcon,
    description: 'Dashboard overview and quick stats',
    group: 'primary',
    enabled: true,
    position: 1,
  },
  {
    id: 'links',
    name: 'Links',
    label: 'Links',
    href: '/dashboard/links',
    icon: LinkIcon,
    description: 'Manage your social and streaming links',
    group: 'primary',
    enabled: true,
    position: 2,
  },
  {
    id: 'analytics',
    name: 'Analytics',
    label: 'Analytics',
    href: '/dashboard/analytics',
    icon: ChartPieIcon,
    description: 'Track your performance and engagement',
    group: 'primary',
    enabled: true,
    position: 3,
  },
  {
    id: 'audience',
    name: 'Audience',
    label: 'Audience',
    href: '/dashboard/audience',
    icon: UsersIcon,
    description: 'Understand your audience demographics',
    group: 'primary',
    enabled: true,
    position: 4,
  },

  // Secondary navigation - Additional features (⌘/Ctrl+5-6)
  {
    id: 'tipping',
    name: 'Tipping',
    label: 'Tipping',
    href: '/dashboard/tipping',
    icon: BanknotesIcon,
    description: 'Manage tips and monetization',
    group: 'secondary',
    enabled: true,
    position: 5,
  },
  {
    id: 'settings',
    name: 'Settings',
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Cog6ToothIcon,
    description: 'Configure your account and preferences',
    group: 'secondary',
    enabled: true,
    position: 6,
  },
];

/**
 * Stable aliases for money-path shortcuts
 * These provide consistent shortcuts regardless of sidebar order
 */
export const STABLE_SHORTCUT_ALIASES: StableShortcutAlias[] = [
  {
    combo: ['cmd+l', 'ctrl+l'],
    targetId: 'links',
    description: 'Go to Links (money path)',
  },
  {
    combo: ['cmd+g', 'ctrl+g'],
    targetId: 'analytics',
    description: 'Go to Analytics (money path)',
  },
];

/**
 * Get visible primary sidebar items in order
 */
export function getPrimaryItems(): SidebarItem[] {
  return SIDEBAR_ITEMS
    .filter(item => item.group === 'primary' && item.enabled)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

/**
 * Get visible secondary sidebar items in order
 */
export function getSecondaryItems(): SidebarItem[] {
  return SIDEBAR_ITEMS
    .filter(item => item.group === 'secondary' && item.enabled)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

/**
 * Get all visible sidebar items in order
 */
export function getAllVisibleItems(): SidebarItem[] {
  return SIDEBAR_ITEMS
    .filter(item => item.enabled)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

/**
 * Get sidebar item by ID
 */
export function getSidebarItem(id: string): SidebarItem | undefined {
  return SIDEBAR_ITEMS.find(item => item.id === id);
}

/**
 * Check if an item should show pro badge
 */
export function isPro(item: SidebarItem): boolean {
  return item.isPro ?? false;
}

/**
 * Get the keyboard shortcut number for an item (1-9)
 * Returns null if item is not in primary navigation or not visible
 */
export function getShortcutNumber(itemId: string): number | null {
  const primaryItems = getPrimaryItems();
  const index = primaryItems.findIndex(item => item.id === itemId);
  return index >= 0 && index < 9 ? index + 1 : null;
}

/**
 * Get item by shortcut number (1-9)
 */
export function getItemByShortcutNumber(number: number): SidebarItem | null {
  if (number < 1 || number > 9) return null;
  
  const primaryItems = getPrimaryItems();
  return primaryItems[number - 1] || null;
}

/**
 * Get stable alias target for a combo
 */
export function getStableAliasTarget(combo: string): string | null {
  const normalizedCombo = combo.toLowerCase().replace(/\s+/g, '');
  
  for (const alias of STABLE_SHORTCUT_ALIASES) {
    const aliasCombos = Array.isArray(alias.combo) ? alias.combo : [alias.combo];
    if (aliasCombos.some(c => c.toLowerCase().replace(/\s+/g, '') === normalizedCombo)) {
      return alias.targetId;
    }
  }
  
  return null;
}

/**
 * Convert legacy navigation arrays to new format (for migration)
 */
export function convertLegacyNavigation(
  primaryNavigation: Array<{ id: string; name: string; href: string; icon: any; description?: string }>,
  secondaryNavigation: Array<{ id: string; name: string; href: string; icon: any; description?: string; isPro?: boolean }>
): SidebarItem[] {
  const items: SidebarItem[] = [];
  
  primaryNavigation.forEach((item, index) => {
    items.push({
      id: item.id,
      name: item.name,
      label: item.name,
      href: item.href,
      icon: item.icon,
      description: item.description || '',
      group: 'primary',
      enabled: true,
      position: index + 1,
    });
  });
  
  secondaryNavigation.forEach((item, index) => {
    items.push({
      id: item.id,
      name: item.name,
      label: item.name,
      href: item.href,
      icon: item.icon,
      description: item.description || '',
      group: 'secondary',
      enabled: true,
      position: primaryNavigation.length + index + 1,
      isPro: item.isPro,
    });
  });
  
  return items;
}