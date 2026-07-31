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
  Waypoints,
} from 'lucide-react';

import { APP_ROUTES } from '@/constants/routes';

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

/** Named Inbox home. `/app` renders the opportunity card stack. */
export const inboxNavItem: NavItem = {
  name: 'Inbox',
  href: APP_ROUTES.DASHBOARD,
  id: 'inbox',
  icon: Inbox,
  description: 'Review pending opportunities',
};

export const chatNavItem: NavItem = {
  name: 'New Chat',
  href: APP_ROUTES.CHAT,
  id: 'chat',
  icon: SquarePen,
  tone: 'primary',
  description: 'Start a new conversation',
};

export const libraryNavItem: NavItem = {
  name: 'Library',
  href: APP_ROUTES.LIBRARY,
  id: 'library',
  icon: Music,
  description: 'Browse releases, audio, video, images, and files',
};

export const contactsNavItem: NavItem = {
  name: 'Contacts',
  href: APP_ROUTES.CONTACTS,
  id: 'contacts',
  icon: IdCard,
  description: 'Manage artist contacts',
};

export const profilesNavItem: NavItem = {
  name: 'Connections',
  href: APP_ROUTES.PROFILES,
  id: 'profiles',
  icon: Waypoints,
  description: 'Monitor artist identities and connected services',
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
 * Founder-approved customer shell IA. This ordered tuple is the only source
 * consumed by desktop and mobile navigation (JOV-3763).
 */
export const primaryNavigation = [
  chatNavItem,
  inboxNavItem,
  libraryNavItem,
  contactsNavItem,
  profilesNavItem,
  calendarNavItem,
  tasksNavItem,
] as const satisfies readonly NavItem[];

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
export const mobilePrimaryNavigation: NavItem[] = primaryNavigation.slice(0, 3);

/** Items shown in the expanded "more" menu on mobile. */
export const mobileExpandedNavigation: NavItem[] = primaryNavigation.slice(3);
