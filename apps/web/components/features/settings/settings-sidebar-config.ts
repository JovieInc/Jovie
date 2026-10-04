import type { ComponentType, SVGProps } from 'react';
import type { SettingsNavItem } from '@/components/features/dashboard/dashboard-nav/config';
import {
  artistSettingsNavigation,
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
  readonly admission: SettingsAdmission;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
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
    admission: item.admission,
    icon: item.icon,
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

export { getSettingsAdmission } from '@/components/features/dashboard/dashboard-nav/config';
