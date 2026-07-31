import {
  Banknote,
  CalendarDays,
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

import { CUSTOMER_NAV_CAPACITY, partitionCustomerNavigation } from './capacity';
import type { NavItem } from './types';

// ---------------------------------------------------------------------------
// Shared navigation items – single source of truth for sidebar + mobile
// ---------------------------------------------------------------------------

export const dashboardHome: NavItem = {
  name: 'Home',
  href: APP_ROUTES.CHAT,
  id: 'overview',
  icon: Home,
  tier: 'core',
  description: 'Start a new chat',
};

/** Named Inbox home. `/app` renders the opportunity card stack. */
export const inboxNavItem: NavItem = {
  name: 'Inbox',
  href: APP_ROUTES.DASHBOARD,
  id: 'inbox',
  icon: Inbox,
  tier: 'core',
  description: 'Review pending opportunities',
};

export const chatNavItem: NavItem = {
  name: 'New Chat',
  href: APP_ROUTES.CHAT,
  id: 'chat',
  icon: SquarePen,
  tone: 'primary',
  tier: 'core',
  description: 'Start a new conversation',
};

export const libraryNavItem: NavItem = {
  name: 'Library',
  href: APP_ROUTES.LIBRARY,
  id: 'library',
  icon: Music,
  tier: 'core',
  description: 'Browse releases, audio, video, images, and files',
};

export const contactsNavItem: NavItem = {
  name: 'Contacts',
  href: APP_ROUTES.CONTACTS,
  id: 'contacts',
  icon: IdCard,
  tier: 'core',
  description: 'Manage artist contacts',
};

export const profilesNavItem: NavItem = {
  name: 'Connections',
  href: APP_ROUTES.PROFILES,
  id: 'profiles',
  icon: Waypoints,
  tier: 'core',
  description: 'Monitor artist identities and connected services',
};

export const calendarNavItem: NavItem = {
  name: 'Calendar',
  href: APP_ROUTES.CALENDAR,
  id: 'calendar',
  icon: CalendarDays,
  tier: 'core',
  description: 'See release dates, events, and calendar moments',
};

/**
 * Founder-approved customer shell IA. This ordered tuple is the only source
 * consumed by desktop and mobile navigation (JOV-3763).
 *
 * Capacity (JOV-4515): every entry here is `core` and must fit the desktop
 * primary rail. Mark new trial destinations `experimental` so they overflow
 * into the single shared More menu after the documented cap — do not grow
 * permanent IA without an explicit product decision.
 */
export const primaryNavigation = [
  chatNavItem,
  inboxNavItem,
  libraryNavItem,
  contactsNavItem,
  profilesNavItem,
  calendarNavItem,
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
// Capacity-derived primary / More groupings (desktop + mobile)
// ---------------------------------------------------------------------------

const desktopDefaultPartition = partitionCustomerNavigation(primaryNavigation, {
  visibleCap: CUSTOMER_NAV_CAPACITY.desktopPrimaryVisible,
});

const mobileDefaultPartition = partitionCustomerNavigation(primaryNavigation, {
  visibleCap: CUSTOMER_NAV_CAPACITY.mobilePrimaryVisible,
});

/**
 * Desktop direct rows when no route is active for promotion. Experimental
 * extras beyond the desktop cap land in {@link desktopMoreNavigation}.
 */
export const desktopPrimaryNavigation: readonly NavItem[] =
  desktopDefaultPartition.visible;

/** Desktop destinations that share the single canonical More menu. */
export const desktopMoreNavigation: readonly NavItem[] =
  desktopDefaultPartition.more;

/**
 * Items shown as icons in the bottom tab bar (capacity-capped).
 *
 * Derived from `primaryNavigation` via {@link partitionCustomerNavigation} —
 * never redefine a NavItem here. Runtime mobile rendering re-partitions with
 * the active route so the current destination is never hidden.
 */
export const mobilePrimaryNavigation: NavItem[] = [
  ...mobileDefaultPartition.visible,
];

/** Items shown in the expanded "more" menu on mobile. */
export const mobileExpandedNavigation: NavItem[] = [
  ...mobileDefaultPartition.more,
];

export type {
  CustomerNavCapacityBreakpoint,
  CustomerNavPartition,
  PartitionCustomerNavigationOptions,
} from './capacity';
export {
  CUSTOMER_NAV_CAPACITY,
  customerNavVisibleCap,
  partitionCustomerNavigation,
} from './capacity';
