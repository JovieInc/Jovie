import type { ComponentType, SVGProps } from 'react';
import {
  artistSettingsNavigation,
  type SettingsNavItem,
  userSettingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';

/**
 * Settings IA projection.
 *
 * `userSettingsNavigation` and `artistSettingsNavigation` in
 * `dashboard-nav/config.ts` are the only settings list DashboardNav renders.
 * This module must not declare a second set of hrefs. Appearance, Referral,
 * Retargeting, and Delete Account stayed in an unused snapshot and are not
 * part of the live rail.
 *
 * Decision admission metadata lives on each live nav item
 * (`SettingsNavItem.admission`); this projection carries it through so the
 * settings surface and the admission validator read the same source.
 */

/** Admission describes the user decision, not a new screen inventory. */
export interface SettingsAdmission {
  readonly userJob: string;
  readonly scope: 'profile' | 'account' | 'workspace';
  readonly roles: readonly (
    | 'preference'
    | 'consent'
    | 'account-control'
    | 'status'
  )[];
  /** Must resolve to the existing app-screen concept, including aliases. */
  readonly canonicalRoute: string;
  readonly screenRationale: string;
  readonly defaultBehavior?: string;
  readonly overrideReason?: string;
}

export interface SettingsSidebarItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly admission: SettingsAdmission;
  /** Only rendered when the current user is an admin. */
  readonly adminOnly?: boolean;
  /** Optional native tooltip for rows whose purpose is not obvious. */
  readonly title?: string;
}

export interface SettingsSidebarGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly SettingsSidebarItem[];
}

function toSidebarItem(item: SettingsNavItem): SettingsSidebarItem {
  return {
    id: item.id,
    label: item.name,
    href: item.href,
    icon: item.icon,
    admission: item.admission,
    ...(item.description ? { title: item.description } : {}),
  };
}

export const SETTINGS_SIDEBAR_GROUPS: readonly SettingsSidebarGroup[] = [
  {
    id: 'account',
    label: 'Account',
    items: userSettingsNavigation.map(toSidebarItem),
  },
  {
    id: 'profile',
    label: 'Profile',
    items: artistSettingsNavigation.map(toSidebarItem),
  },
];

/**
 * Filter the settings groups for the sidebar's search input.
 *
 * Customer settings carry no admin rows: operator controls live in Ovie
 * (JOV-6771), so admins and creators see the same settings IA.
 *
 * - Admin-only items are dropped unless `isAdmin` is true.
 * - A query matches an item when it appears in the item label, user job or the group
 *   label (case-insensitive substring).
 * - Groups with no visible items are dropped entirely.
 */
export interface FilterSettingsGroupsOptions {
  readonly isAdmin?: boolean;
}

export function filterSettingsGroups(
  groups: readonly SettingsSidebarGroup[],
  query: string,
  options: FilterSettingsGroupsOptions = {}
): SettingsSidebarGroup[] {
  const normalized = query.trim().toLowerCase();

  return groups
    .map(group => {
      const groupMatches = group.label.toLowerCase().includes(normalized);
      const items = group.items.filter(item => {
        if (item.adminOnly && !options.isAdmin) {
          return false;
        }
        if (!normalized) {
          return true;
        }
        return (
          groupMatches ||
          item.label.toLowerCase().includes(normalized) ||
          item.admission.userJob.toLowerCase().includes(normalized)
        );
      });

      return { ...group, items };
    })
    .filter(group => group.items.length > 0);
}

/** Whether a settings nav item is active for the current pathname. */
export function isSettingsItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Share admission with the live UnifiedSidebar configuration without copying it. */
export function getSettingsAdmission(id: string): SettingsAdmission {
  const item = SETTINGS_SIDEBAR_GROUPS.flatMap(group => group.items).find(
    item => item.id === id
  );
  if (!item) throw new Error(`Missing settings admission: ${id}`);
  return item.admission;
}
