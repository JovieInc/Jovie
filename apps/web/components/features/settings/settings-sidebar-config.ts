import {
  Banknote,
  Cable,
  Contact,
  Gauge,
  Lock,
  type LucideIcon,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { APP_ROUTES } from '@/constants/routes';

// Settings IA — approved 2026-07-03 via Design Shootout (`settings-ia`).
// Groups the settings sub-pages under 4 top-level groups. This config is
// the single source of truth for the settings sidebar; the nav snapshot test
// in settings-sidebar-config.test.ts locks the structure so changes require
// a deliberate review (see #12645 IA guardrails).

export interface SettingsSidebarItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
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

export const SETTINGS_SIDEBAR_GROUPS: readonly SettingsSidebarGroup[] = [
  {
    id: 'identity',
    label: 'Identity',
    items: [
      {
        id: 'profile',
        label: 'Profile',
        href: APP_ROUTES.SETTINGS_PROFILE,
        icon: UserRound,
      },
      {
        id: 'contacts',
        label: 'Contacts',
        href: APP_ROUTES.SETTINGS_CONTACTS,
        icon: Contact,
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      {
        id: 'account',
        label: 'Account',
        href: APP_ROUTES.SETTINGS_ACCOUNT,
        icon: ShieldCheck,
      },
      {
        id: 'data-privacy',
        label: 'Data & Privacy',
        href: APP_ROUTES.SETTINGS_DATA_PRIVACY,
        icon: Lock,
      },
      {
        id: 'delete-account',
        label: 'Delete Account',
        href: APP_ROUTES.SETTINGS_DELETE_ACCOUNT,
        icon: Trash2,
      },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      {
        id: 'connections',
        label: 'Connections',
        href: APP_ROUTES.SETTINGS_CONNECTORS,
        icon: Cable,
      },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    items: [
      {
        id: 'billing',
        label: 'Billing',
        href: APP_ROUTES.SETTINGS_BILLING,
        icon: Banknote,
      },
      {
        id: 'usage',
        label: 'Usage',
        href: APP_ROUTES.SETTINGS_USAGE,
        icon: Gauge,
      },
    ],
  },
];

/**
 * Filter the settings groups for the sidebar's search input.
 *
 * Customer settings carry no admin rows: operator controls live in Ovie
 * (JOV-6771), so admins and creators see the same settings IA.
 *
 * - Admin-only items are dropped unless `isAdmin` is true.
 * - A query matches an item when it appears in the item label or the group
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
        return groupMatches || item.label.toLowerCase().includes(normalized);
      });

      return { ...group, items };
    })
    .filter(group => group.items.length > 0);
}

/** Whether a settings nav item is active for the current pathname. */
export function isSettingsItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
