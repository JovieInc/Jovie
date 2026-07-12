import {
  Activity,
  Banknote,
  Briefcase,
  Cable,
  CalendarDays,
  CheckSquare,
  Flag,
  FolderKanban,
  Gauge,
  HandCoins,
  Home,
  IdCard,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Lock,
  type LucideIcon,
  MailCheck,
  Map,
  Music,
  PieChart,
  Settings,
  Share2,
  ShieldCheck,
  SquarePen,
  TrendingUp,
  UserCircle,
  Users,
} from 'lucide-react';

import {
  ADMIN_NAV_REGISTRY,
  ADMIN_PRIMARY_WORKSPACE_IDS,
  ADMIN_SETTINGS_TOOL_IDS,
  type AdminWorkspaceId,
} from '@/constants/admin-navigation';
import { APP_ROUTES, buildLibraryViewRoute } from '@/constants/routes';

import type { NavItem } from './types';

// ---------------------------------------------------------------------------
// Shared navigation items – single source of truth for sidebar + mobile
// ---------------------------------------------------------------------------

export const dashboardHome: NavItem = {
  name: 'Home',
  href: APP_ROUTES.CHAT,
  id: 'overview',
  icon: Home,
  description: 'Start a new chat',
};

/**
 * Named Inbox home (JOV-3931 / GH #13171). Points at `/app` which renders the
 * opportunity card stack. Only shown when the `INBOX_HOME` flag is on.
 */
export const inboxNavItem: NavItem = {
  name: 'Inbox',
  href: APP_ROUTES.DASHBOARD,
  id: 'inbox',
  icon: Inbox,
  description: 'Review pending opportunities',
};

export const newThreadNavItem: NavItem = {
  name: 'Chat',
  href: APP_ROUTES.CHAT,
  id: 'chat',
  icon: SquarePen,
  description: 'Start a new conversation',
};

export const profileNavItem: NavItem = {
  name: 'Profile',
  href: APP_ROUTES.CHAT_PROFILE_PANEL,
  id: 'profile',
  description: 'Open profile preview and links',
  icon: UserCircle,
};

export const releasesNavItem: NavItem = {
  name: 'Library',
  href: buildLibraryViewRoute('releases'),
  id: 'releases',
  icon: Music,
  description:
    'Browse releases and link out every provider with one smart link',
};

/** @deprecated Use releasesNavItem — Library is the canonical Releases surface. */
export const libraryNavItem: NavItem = releasesNavItem;

export const artistProfileNavItem: NavItem = {
  name: 'Artist Profile',
  href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
  id: 'artist-profile',
  icon: UserCircle,
  description: 'Edit your artist profile, links, and branding',
};

export const touringNavItem: NavItem = {
  name: 'Touring',
  href: APP_ROUTES.SETTINGS_TOURING,
  id: 'touring',
  icon: CalendarDays,
  description: 'Manage tour dates and touring settings',
};

export const contactsNavItem: NavItem = {
  name: 'Contacts',
  href: APP_ROUTES.CONTACTS,
  id: 'contacts',
  icon: IdCard,
  description: 'Manage contacts, collaborators, and press relationships',
};

export const calendarNavItem: NavItem = {
  name: 'Calendar',
  href: APP_ROUTES.CALENDAR,
  id: 'calendar',
  icon: CalendarDays,
  description: 'See release dates, events, and calendar moments',
};

export const tasksNavItem: NavItem = {
  name: 'Tasks',
  href: APP_ROUTES.TASKS,
  id: 'tasks',
  icon: CheckSquare,
  description: 'Track release work and general artist operations',
};

/**
 * Canonical 6-item nav IA (GH #12634 taste decision / #12640): Inbox is the
 * named home and appears first. Consumers gate Inbox's presence on the
 * `INBOX_HOME` rollout flag (see DashboardNav) rather than filtering it out
 * of this array, so this list stays the single source of truth for the
 * target IA order even while Inbox is mid-rollout.
 */
export const primaryNavigation: NavItem[] = [
  inboxNavItem,
  newThreadNavItem,
  releasesNavItem,
  contactsNavItem,
  calendarNavItem,
  tasksNavItem,
];

export const settingsNavItem: NavItem = {
  name: 'Settings',
  href: APP_ROUTES.SETTINGS,
  id: 'settings',
  icon: Settings,
};

/** User-level settings: account, preferences, billing */
export const userSettingsNavigation: NavItem[] = [
  {
    name: 'Account',
    href: APP_ROUTES.SETTINGS_ACCOUNT,
    id: 'account',
    icon: ShieldCheck,
  },
  {
    name: 'Usage Stats',
    href: APP_ROUTES.SETTINGS_USAGE,
    id: 'usage',
    icon: Gauge,
  },
  {
    name: 'Billing & Subscription',
    href: APP_ROUTES.SETTINGS_BILLING,
    id: 'billing',
    icon: Banknote,
  },
  {
    name: 'Data & Privacy',
    href: APP_ROUTES.SETTINGS_DATA_PRIVACY,
    id: 'data-privacy',
    icon: Lock,
  },
];

/** Payments settings item — feature-gated, included conditionally */
export const paymentsNavItem: NavItem = {
  name: 'Payments',
  href: APP_ROUTES.SETTINGS_PAYMENTS,
  id: 'payments',
  icon: HandCoins,
};

/** Artist-level settings: profile, links, branding, tracking */
export const artistSettingsNavigation: NavItem[] = [
  {
    name: 'Profile',
    href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    id: 'artist-profile',
    icon: UserCircle,
  },
  {
    name: 'Contacts',
    href: APP_ROUTES.SETTINGS_CONTACTS,
    id: 'contacts',
    icon: IdCard,
  },
  {
    name: 'Touring',
    href: APP_ROUTES.SETTINGS_TOURING,
    id: 'touring',
    icon: CalendarDays,
  },
  {
    name: 'Analytics',
    href: APP_ROUTES.SETTINGS_ANALYTICS,
    id: 'analytics',
    icon: PieChart,
  },
  {
    name: 'Audience & Tracking',
    href: APP_ROUTES.SETTINGS_AUDIENCE,
    id: 'audience-tracking',
    icon: MailCheck,
  },
];

/** Admin settings item — shown only to admin users */
export const adminSettingsNavItem: NavItem = {
  name: 'Admin',
  href: APP_ROUTES.SETTINGS_ADMIN,
  id: 'admin-settings',
  icon: Settings,
};

/** Combined settings navigation (all items flat) */
export const settingsNavigation: NavItem[] = [
  ...userSettingsNavigation,
  ...artistSettingsNavigation,
];

/** Admin settings item — shown only to admin users */

// Exhaustive map of AdminWorkspaceId → icon. Typed as Record so adding a new
// workspace id to `AdminWorkspaceId` without a matching icon entry fails
// typecheck — silent `undefined` returns would otherwise show up as missing
// icons in the admin sidebar at runtime.
const adminIconById: Record<AdminWorkspaceId, LucideIcon> = {
  overview: LayoutDashboard,
  ops: Gauge,
  people: Users,
  growth: FolderKanban,
  platform_connections: Cable,
  activity: Activity,
  investors: Briefcase,
  screenshots: ImageIcon,
  costs: Banknote,
  revenue_lift: TrendingUp,
  share_studio: Share2,
  system_map: Map,
  features: Flag,
};

function buildAdminNavigationItems(
  ids: readonly AdminWorkspaceId[]
): NavItem[] {
  return ids.map(id => {
    const item = ADMIN_NAV_REGISTRY.find(entry => entry.id === id);

    if (!item) {
      throw new Error(`Missing admin navigation registry item for "${id}"`);
    }

    return {
      name: item.label,
      href: item.href,
      id: `admin_${item.id}`,
      icon: adminIconById[item.id],
      description: item.description,
    };
  });
}

export const adminNavigation: NavItem[] = buildAdminNavigationItems(
  ADMIN_PRIMARY_WORKSPACE_IDS
);

export const adminSettingsNavigation: NavItem[] = buildAdminNavigationItems(
  ADMIN_SETTINGS_TOOL_IDS
);

export interface AdminNavSection {
  label: string;
  items: NavItem[];
}

export const adminNavigationSections: AdminNavSection[] = [
  {
    label: 'Workspaces',
    items: adminNavigation,
  },
  {
    label: 'Utilities',
    items: adminSettingsNavigation,
  },
];

// ---------------------------------------------------------------------------
// Mobile bottom-bar groupings (derived from shared items above)
// ---------------------------------------------------------------------------

/**
 * Items shown as icons in the bottom tab bar (max 3).
 *
 * Picked by id from the canonical `primaryNavigation` — never redefine a
 * NavItem here. A mobile-only nav item is a third source of truth that
 * drifts from desktop.
 */
export const mobilePrimaryNavigation: NavItem[] = [
  newThreadNavItem,
  releasesNavItem,
  tasksNavItem,
];

/**
 * Items shown in the expanded "more" menu on mobile.
 *
 * Inbox is intentionally excluded from both mobile lists for now — the
 * bottom bar is computed once at module load (no flag read), so it cannot
 * mirror desktop's `INBOX_HOME` rollout gating yet. Wiring Inbox into mobile
 * is deeper mobile work tracked separately (chunk 1.5 of the One App Shell
 * program, GH #12633).
 */
export const mobileExpandedNavigation: NavItem[] = [
  artistProfileNavItem,
  touringNavItem,
  contactsNavItem,
  calendarNavItem,
  settingsNavItem,
];
