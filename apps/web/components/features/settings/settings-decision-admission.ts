import type { ComponentType, SVGProps } from 'react';
import type { SettingsNavItem } from '@/components/features/dashboard/dashboard-nav/config';
import {
  artistSettingsNavigation,
  userSettingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';

/**
 * Settings decision metadata derived from the live navigation. This module
 * supplies admission validation; UnifiedSidebar continues to render only
 * dashboard-nav/config.ts. No independent route inventory is declared here.
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

export interface SettingsAdmissionItem {
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

export interface SettingsAdmissionGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly SettingsAdmissionItem[];
}

function toSidebarItem(item: SettingsNavItem): SettingsAdmissionItem {
  return {
    id: item.id,
    label: item.name,
    href: item.href,
    admission: item.admission,
    icon: item.icon,
    ...(item.description ? { title: item.description } : {}),
  };
}

export const SETTINGS_ADMISSION_GROUPS: readonly SettingsAdmissionGroup[] = [
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

export interface FilterSettingsAdmissionsOptions {
  readonly isAdmin?: boolean;
}

function settingsSearchWords(value: string): string[] {
  return (
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** Match every query word against the visible label, description or user job. */
export function matchesSettingsSearchQuery(
  query: string,
  fields: readonly (string | undefined)[]
): boolean {
  if (!query.trim()) return true;

  const queryWords = settingsSearchWords(query);
  // Punctuation alone is not a request to reveal every destination.
  if (queryWords.length === 0) return false;

  const words = fields.flatMap(field =>
    field ? settingsSearchWords(field) : []
  );
  return queryWords.every(queryWord =>
    words.some(word => word.startsWith(queryWord))
  );
}

export function filterSettingsAdmissions(
  groups: readonly SettingsAdmissionGroup[],
  query: string,
  options: FilterSettingsAdmissionsOptions = {}
): SettingsAdmissionGroup[] {
  return groups
    .map(group => {
      const groupMatches = matchesSettingsSearchQuery(query, [group.label]);
      const items = group.items.filter(item => {
        if (item.adminOnly && !options.isAdmin) {
          return false;
        }
        return (
          groupMatches ||
          matchesSettingsSearchQuery(query, [
            item.label,
            item.title,
            item.admission.userJob,
          ])
        );
      });

      return { ...group, items };
    })
    .filter(group => group.items.length > 0);
}

/** Whether a settings nav item is active for the current pathname. */
export function isSettingsAdmissionRouteActive(
  pathname: string,
  href: string
): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export { getSettingsAdmission } from '@/components/features/dashboard/dashboard-nav/config';
