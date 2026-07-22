import {
  Banknote,
  CalendarDays,
  CheckSquare,
  Gauge,
  HandCoins,
  Home,
  IdCard,
  Inbox,
  Lock,
  MailCheck,
  Music,
  PieChart,
  Settings,
  ShieldCheck,
  SquarePen,
  UserCircle,
  Users,
} from 'lucide-react';

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
  name: 'New Chat',
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
  name: 'Releases',
  href: buildLibraryViewRoute('releases'),
  id: 'releases',
  icon: Music,
  description:
    'Browse releases and link out every provider with one smart link',
};

/** @deprecated Use releasesNavItem — Library is the canonical Releases surface. */
export const libraryNavItem: NavItem = releasesNavItem;

export const artistProfileNavItem: NavItem = {
  name: 'Profiles',
  href: APP_ROUTES.PROFILES,
  id: 'profiles',
  icon: IdCard,
  description: 'Monitor your artist profiles, sources, and connectors',
};

export function filterProfilesWorkspaceNavigation(
  items: readonly NavItem[],
  profilesWorkspaceEnabled: boolean
): NavItem[] {
  return profilesWorkspaceEnabled
    ? [...items]
    : items.filter(item => item.id !== artistProfileNavItem.id);
}

export const touringNavItem: NavItem = {
  name: 'Touring',
  href: APP_ROUTES.TOUR_DATES,
  id: 'touring',
  icon: CalendarDays,
  description: 'Manage tour dates and events',
};

export const primaryNavigation: NavItem[] = [
  newThreadNavItem,
  releasesNavItem,
  artistProfileNavItem,
  touringNavItem,
  {
    name: 'Calendar',
    href: APP_ROUTES.CALENDAR,
    id: 'calendar',
    icon: CalendarDays,
    description: 'See release dates, events, and calendar moments',
  },
  {
    name: 'Tasks',
    href: APP_ROUTES.TASKS,
    id: 'tasks',
    icon: CheckSquare,
    description: 'Track release work and general artist operations',
  },
  {
    name: 'Audience',
    href: APP_ROUTES.AUDIENCE,
    id: 'audience',
    icon: Users,
    description: 'Understand your audience demographics',
  },
];

export const calendarNavItem = primaryNavigation.find(
  item => item.id === 'calendar'
)!;

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

/** Combined settings navigation (all items flat) */
export const settingsNavigation: NavItem[] = [
  ...userSettingsNavigation,
  ...artistSettingsNavigation,
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
  primaryNavigation.find(i => i.id === 'releases')!,
  primaryNavigation.find(i => i.id === 'audience')!,
];

/** Items shown in the expanded "more" menu on mobile. */
export const mobileExpandedNavigation: NavItem[] = [
  artistProfileNavItem,
  touringNavItem,
  calendarNavItem,
  primaryNavigation.find(i => i.id === 'tasks')!,
  settingsNavItem,
];
