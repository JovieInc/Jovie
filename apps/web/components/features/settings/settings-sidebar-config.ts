import {
  Banknote,
  Cable,
  Contact,
  Gauge,
  Gift,
  Lock,
  type LucideIcon,
  Palette,
  ShieldCheck,
  Target,
  Trash2,
  UserRound,
  Wrench,
} from 'lucide-react';
import { APP_ROUTES } from '@/constants/routes';

// Settings IA — approved 2026-07-03 via Design Shootout (`settings-ia`).
// Groups the 11 settings sub-pages under 4 top-level groups. This config is
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
}

export interface SettingsSidebarGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly SettingsSidebarItem[];
}

export const SETTINGS_SIDEBAR_GROUPS: readonly SettingsSidebarGroup[] = [
  {
    id: 'profile',
    label: 'Profile',
    items: [
      {
        id: 'artist-profile',
        label: 'Artist profile',
        href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
        icon: UserRound,
      },
      {
        id: 'contacts',
        label: 'Contacts',
        href: APP_ROUTES.SETTINGS_CONTACTS,
        icon: Contact,
      },
      {
        id: 'appearance',
        label: 'Appearance',
        href: APP_ROUTES.SETTINGS_APPEARANCE,
        icon: Palette,
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
        label: 'Data & privacy',
        href: APP_ROUTES.SETTINGS_DATA_PRIVACY,
        icon: Lock,
      },
      {
        id: 'delete-account',
        label: 'Delete account',
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
        id: 'connectors',
        label: 'Connectors',
        href: APP_ROUTES.SETTINGS_CONNECTORS,
        icon: Cable,
      },
      {
        id: 'retargeting-ads',
        label: 'Retargeting ads',
        href: APP_ROUTES.SETTINGS_RETARGETING_ADS,
        icon: Target,
      },
      {
        id: 'admin',
        label: 'Admin',
        href: APP_ROUTES.SETTINGS_ADMIN,
        icon: Wrench,
        adminOnly: true,
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
      {
        id: 'referral',
        label: 'Referral',
        href: APP_ROUTES.SETTINGS_REFERRAL,
        icon: Gift,
      },
    ],
  },
];

export interface FilterSettingsGroupsOptions {
  readonly isAdmin?: boolean;
}

/**
 * Filter the settings groups for the sidebar's search input.
 *
 * - Admin-only items are dropped unless `isAdmin` is true.
 * - A query matches an item when it appears in the item label or the group
 *   label (case-insensitive substring).
 * - Groups with no visible items are dropped entirely.
 */
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
