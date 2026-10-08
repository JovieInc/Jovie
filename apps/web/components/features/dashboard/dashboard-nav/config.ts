import {
  Banknote,
  CalendarDays,
  CheckSquare,
  Gauge,
  HandCoins,
  Home,
  IdCard,
  Inbox,
  Layers,
  Link,
  Lock,
  MailCheck,
  PieChart,
  Plug,
  Settings,
  ShieldCheck,
  SquarePen,
  User,
  UserCircle,
  Users,
} from 'lucide-react';
import type { SettingsAdmission } from '@/components/features/settings/settings-decision-admission';

import { APP_ROUTES } from '@/constants/routes';
import { PRODUCT_ONTOLOGY } from '@/data/productOntology';
import type { AppFlagName } from '@/lib/flags/contracts';

import { CUSTOMER_NAV_CAPACITY, partitionCustomerNavigation } from './capacity';
import type { NavItem } from './types';

// ---------------------------------------------------------------------------
// Shared navigation items – single source of truth for sidebar + mobile
// ---------------------------------------------------------------------------

/** Named Inbox home. `/app` renders the opportunity card stack. */
export const inboxNavItem: NavItem = {
  name: 'Inbox',
  href: APP_ROUTES.DASHBOARD,
  id: 'inbox',
  icon: Inbox,
  iconName: 'Inbox',
  tier: 'core',
  description: 'Review pending opportunities',
};

export const chatNavItem: NavItem = {
  name: 'New Chat',
  href: APP_ROUTES.CHAT,
  id: 'chat',
  icon: SquarePen,
  iconName: 'SquarePen',
  tone: 'primary',
  tier: 'core',
  description: 'Start a new conversation',
};

export const homeNavItem: NavItem = {
  name: 'Home',
  href: APP_ROUTES.DASHBOARD,
  id: 'home',
  icon: Home,
  iconName: 'Home',
  tier: 'core',
  description: 'Open your Jovie home',
};

export const libraryNavItem: NavItem = {
  name: PRODUCT_ONTOLOGY.work.label,
  href: APP_ROUTES.LIBRARY,
  id: 'library',
  icon: Layers,
  iconName: 'Layers',
  tier: 'core',
  description: PRODUCT_ONTOLOGY.work.definition,
};

export const contactsNavItem: NavItem = {
  name: 'Contacts',
  href: APP_ROUTES.CONTACTS,
  id: 'contacts',
  icon: IdCard,
  iconName: 'IdCard',
  tier: 'core',
  description: 'Manage contacts',
};

export const presenceNavItem: NavItem = {
  name: 'Profiles',
  href: APP_ROUTES.PRESENCE,
  id: 'presence',
  icon: User,
  iconName: 'User',
  tier: 'core',
  description: PRODUCT_ONTOLOGY.identity.definition,
  requiredFlag: 'PROFILES_WORKSPACE',
};

/** Drop destinations whose required flag is off. Missing values stay hidden. */
export function navigationVisibleForFlags<
  T extends { requiredFlag?: AppFlagName },
>(items: readonly T[], flags: Partial<Record<AppFlagName, boolean>>): T[] {
  return items.filter(
    item => !item.requiredFlag || flags[item.requiredFlag] === true
  );
}

export const linksNavItem: NavItem = {
  name: 'Links',
  href: APP_ROUTES.CHAT_PROFILE_PANEL,
  id: 'links',
  icon: Link,
  iconName: 'Link',
  tier: 'core',
  description: 'Manage links that represent your identity and work',
};

export const audienceNavItem: NavItem = {
  name: 'Audience',
  href: APP_ROUTES.CONTACTS_AUDIENCE,
  id: 'audience',
  icon: Users,
  iconName: undefined,
  tier: 'core',
  description: 'Understand and reach your audience',
};

export const calendarNavItem: NavItem = {
  name: 'Calendar',
  href: APP_ROUTES.CALENDAR,
  id: 'calendar',
  icon: CalendarDays,
  iconName: 'CalendarDays',
  tier: 'core',
  description: 'See release dates, events, and calendar moments',
};

export const tasksNavItem: NavItem = {
  name: 'Tasks',
  href: APP_ROUTES.TASKS,
  id: 'tasks',
  icon: CheckSquare,
  iconName: 'CheckSquare',
  tier: 'core',
  description: 'Open the task workspace',
};

/** Contextual artist destinations may materialize without growing root IA. */
export const artistNavigation = [] as const satisfies readonly NavItem[];

/**
 * Founder-approved top-level product ontology (JOV-7305): one ordered tuple
 * shared by desktop, mobile, and route coverage. Entity collections such as
 * links, releases, products, events, and videos remain contextual views or
 * representations instead of permanent root destinations.
 *
 * Capacity (JOV-4515): every entry here is `core` and must fit the desktop
 * primary rail. Mark new trial destinations `experimental` so they overflow
 * into the single shared More menu after the documented cap. An entity type
 * graduates only with an explicit product decision and a substantial workflow.
 */
export const primaryNavigation = [
  homeNavItem,
  presenceNavItem,
  libraryNavItem,
  audienceNavItem,
] as const satisfies readonly NavItem[];

/** Desktop and mobile consume the same ordered job-level destination set. */
export const canonicalSidebarNavigation = primaryNavigation;

export const settingsNavItem: NavItem = {
  name: 'Settings',
  href: APP_ROUTES.SETTINGS,
  id: 'settings',
  icon: Settings,
};

export type SettingsNavItem = NavItem & { admission: SettingsAdmission };

/** User-level settings: account, preferences, billing */
export const userSettingsNavigation: SettingsNavItem[] = [
  {
    name: 'Account',
    href: APP_ROUTES.SETTINGS_ACCOUNT,
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
    icon: ShieldCheck,
  },
  {
    name: 'Connections',
    href: APP_ROUTES.SETTINGS_CONNECTORS,
    id: 'connections',
    admission: {
      userJob:
        'Review connected services, permissions and scopes; repair access',
      scope: 'account',
      roles: ['status', 'consent', 'account-control'],
      canonicalRoute: APP_ROUTES.SETTINGS_CONNECTORS,
      screenRationale:
        'Service access, consent and recovery belong together; individual task approvals belong in their workflow.',
    },
    icon: Plug,
    description: 'Manage account-authorized services',
  },
  {
    name: 'Usage Stats',
    href: APP_ROUTES.SETTINGS_USAGE,
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
    icon: Gauge,
  },
  {
    name: 'Billing & Subscription',
    href: APP_ROUTES.SETTINGS_BILLING,
    id: 'billing',
    admission: {
      userJob: 'Review subscription terms and manage the current plan',
      scope: 'account',
      roles: ['status', 'account-control'],
      canonicalRoute: APP_ROUTES.SETTINGS_BILLING,
      screenRationale:
        'Subscription terms and consequential plan controls require a stable destination.',
    },
    icon: Banknote,
  },
  {
    name: 'Data & Privacy',
    href: APP_ROUTES.SETTINGS_DATA_PRIVACY,
    id: 'data-privacy',
    admission: {
      userJob: 'Review privacy choices and export personal data',
      scope: 'account',
      roles: ['consent', 'account-control'],
      canonicalRoute: APP_ROUTES.SETTINGS_DATA_PRIVACY,
      screenRationale:
        'Privacy decisions and consequential data controls must remain discoverable.',
    },
    icon: Lock,
  },
];

/** Payments settings item — feature-gated, included conditionally */
export const paymentsNavItem: SettingsNavItem = {
  name: 'Payments',
  href: APP_ROUTES.SETTINGS_PAYMENTS,
  id: 'payments',
  admission: {
    userJob: 'Review payment connection status and manage payout setup',
    scope: 'account',
    roles: ['status', 'consent', 'account-control'],
    canonicalRoute: APP_ROUTES.SETTINGS_PAYMENTS,
    screenRationale:
      'Feature-gated payment setup needs explicit access and financial context.',
  },
  icon: HandCoins,
};

/** Artist-level settings: profile, links, branding, tracking */
export const artistSettingsNavigation: SettingsNavItem[] = [
  {
    name: 'Profile',
    href: APP_ROUTES.SETTINGS_PROFILE,
    id: 'artist-profile',
    admission: {
      userJob: 'Edit artist identity and public profile details',
      scope: 'profile',
      roles: ['preference'],
      canonicalRoute: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
      screenRationale:
        'Related public identity controls share one profile destination.',
    },
    icon: UserCircle,
  },
  {
    name: 'Contacts',
    href: APP_ROUTES.SETTINGS_CONTACTS,
    id: 'contacts',
    admission: {
      userJob: 'Manage public contact details and contact visibility',
      scope: 'profile',
      roles: ['preference', 'consent'],
      canonicalRoute: APP_ROUTES.SETTINGS_CONTACTS,
      screenRationale:
        'Contact methods and their visibility need a coherent review context.',
    },
    icon: IdCard,
  },
  {
    name: 'Touring',
    href: APP_ROUTES.SETTINGS_TOURING,
    id: 'touring',
    admission: {
      userJob: 'Review tour-date service access and synchronization choices',
      scope: 'workspace',
      roles: ['status', 'consent', 'preference'],
      canonicalRoute: APP_ROUTES.SETTINGS_TOURING,
      screenRationale:
        'Related touring integration choices share a recovery and configuration context.',
    },
    icon: CalendarDays,
  },
  {
    name: 'Analytics',
    href: APP_ROUTES.SETTINGS_ANALYTICS,
    id: 'analytics',
    admission: {
      userJob: 'Control whether personal visits appear in analytics',
      scope: 'profile',
      roles: ['preference'],
      canonicalRoute: APP_ROUTES.SETTINGS_ANALYTICS,
      screenRationale:
        'The existing analytics destination provides context for measurement preferences.',
    },
    icon: PieChart,
  },
  {
    name: 'Audience & Tracking',
    href: APP_ROUTES.SETTINGS_AUDIENCE,
    id: 'audience-tracking',
    admission: {
      userJob: 'Review fan verification, opt-ins and audience tracking',
      scope: 'profile',
      roles: ['consent', 'preference'],
      canonicalRoute: APP_ROUTES.SETTINGS_AUDIENCE,
      screenRationale:
        'Verification and tracking decisions need a coherent privacy context.',
    },
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
  ...artistNavigation,
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

/** Read metadata from the live navigation, including its gated entry. */
export function getSettingsAdmission(id: string): SettingsAdmission {
  const item = [
    ...userSettingsNavigation,
    ...artistSettingsNavigation,
    paymentsNavItem,
  ].find(item => item.id === id);
  if (!item) throw new Error(`Missing settings admission: ${id}`);
  return item.admission;
}
