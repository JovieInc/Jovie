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
// Groups the 8 settings navigation entries under 4 top-level groups. This config is
// a compatibility fixture. UnifiedSidebar renders dashboard-nav/config.ts;
// its settings entries share the admission metadata below. The nav snapshot test
// in settings-sidebar-config.test.ts locks the structure so changes require
// a deliberate review (see #12645 IA guardrails).

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
  readonly icon: LucideIcon;
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

export const SETTINGS_SIDEBAR_GROUPS: readonly SettingsSidebarGroup[] = [
  {
    id: 'profile',
    label: 'Profile',
    items: [
      {
        id: 'artist-profile',
        admission: {
          userJob: 'Edit artist identity and public profile details',
          scope: 'profile',
          roles: ['preference'],
          canonicalRoute: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
          screenRationale:
            'Related public identity controls share one profile destination.',
        },
        label: 'Artist Profile',
        href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
        icon: UserRound,
      },
      {
        id: 'contacts',
        admission: {
          userJob: 'Manage public contact details and contact visibility',
          scope: 'profile',
          roles: ['preference', 'consent'],
          canonicalRoute: APP_ROUTES.SETTINGS_CONTACTS,
          screenRationale:
            'Contact methods and their visibility need a coherent review context.',
        },
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
        admission: {
          userJob:
            'Manage account identity, security and display theme for legibility',
          scope: 'account',
          roles: ['account-control', 'preference'],
          canonicalRoute: APP_ROUTES.SETTINGS_ACCOUNT,
          screenRationale:
            'Account identity, security and display preferences share a stable destination.',
          defaultBehavior: 'Follow the system theme',
          overrideReason:
            'People can choose Light, Dark or System for visual comfort and legibility',
        },
        label: 'Account',
        href: APP_ROUTES.SETTINGS_ACCOUNT,
        icon: ShieldCheck,
      },
      {
        id: 'data-privacy',
        admission: {
          userJob: 'Review privacy choices and export personal data',
          scope: 'account',
          roles: ['consent', 'account-control'],
          canonicalRoute: APP_ROUTES.SETTINGS_DATA_PRIVACY,
          screenRationale:
            'Privacy decisions and consequential data controls must remain discoverable.',
        },
        label: 'Data & Privacy',
        href: APP_ROUTES.SETTINGS_DATA_PRIVACY,
        icon: Lock,
      },
      {
        id: 'delete-account',
        admission: {
          userJob: 'Delete the account with informed confirmation',
          scope: 'account',
          roles: ['account-control'],
          canonicalRoute: APP_ROUTES.SETTINGS_DATA_PRIVACY,
          screenRationale:
            'An alias exposes a consequential action within the existing privacy destination.',
        },
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
        admission: {
          userJob:
            'Review connected services, permissions and scopes; repair access',
          scope: 'workspace',
          roles: ['status', 'consent', 'account-control'],
          canonicalRoute: APP_ROUTES.SETTINGS_CONNECTORS,
          screenRationale:
            'Service access, consent and recovery belong together; individual task approvals belong in their workflow.',
        },
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
        admission: {
          userJob: 'Review subscription terms and manage the current plan',
          scope: 'account',
          roles: ['status', 'account-control'],
          canonicalRoute: APP_ROUTES.SETTINGS_BILLING,
          screenRationale:
            'Subscription terms and consequential plan controls require a stable destination.',
        },
        label: 'Billing',
        href: APP_ROUTES.SETTINGS_BILLING,
        icon: Banknote,
      },
      {
        id: 'usage',
        admission: {
          userJob:
            'Understand message allowance, remaining capacity and reset timing',
          scope: 'account',
          roles: ['status'],
          canonicalRoute: APP_ROUTES.SETTINGS_USAGE,
          screenRationale:
            'A direct usage destination supports an informed capacity decision using the same snapshot as contextual usage.',
        },
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
