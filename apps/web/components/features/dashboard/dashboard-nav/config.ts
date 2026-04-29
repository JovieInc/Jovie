import {
  Activity,
  Banknote,
  Briefcase,
  Cable,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  HandCoins,
  Home,
  IdCard,
  Image as ImageIcon,
  LayoutDashboard,
  Library as LibraryIcon,
  Lock,
  MailCheck,
  Music,
  PieChart,
  Settings,
  Share2,
  ShieldCheck,
  SquarePen,
  UserCircle,
  Users,
} from 'lucide-react';

import {
  ADMIN_NAV_REGISTRY,
  ADMIN_PRIMARY_WORKSPACE_IDS,
  ADMIN_SETTINGS_TOOL_IDS,
  type AdminWorkspaceId,
} from '@/constants/admin-navigation';
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
  description: 'Start a new thread',
};

export const profileNavItem: NavItem = {
  name: 'Profile',
  href: APP_ROUTES.CHAT,
  id: 'profile',
  icon: UserCircle,
  description: 'Update your profile and links',
};

export const primaryNavigation: NavItem[] = [
  profileNavItem,
  {
    name: 'Releases',
    href: APP_ROUTES.DASHBOARD_RELEASES,
    id: 'releases',
    icon: Music,
    description: 'Link out every provider with one smart link',
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
    href: APP_ROUTES.DASHBOARD_AUDIENCE,
    id: 'audience',
    icon: Users,
    description: 'Understand your audience demographics',
  },
];

export const libraryNavItem: NavItem = {
  name: 'Library',
  href: APP_ROUTES.DASHBOARD_LIBRARY,
  id: 'library',
  icon: LibraryIcon,
  description: 'Browse read-only release assets and provider links',
};

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

const adminIconById = {
  overview: LayoutDashboard,
  people: Users,
  growth: FolderKanban,
  platform_connections: Cable,
  activity: Activity,
  investors: Briefcase,
  screenshots: ImageIcon,
  share_studio: Share2,
} as const;

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
];

export const adminSettingsNavigationSections: AdminNavSection[] = [
  {
    // Settings keeps quick links to the primary workspaces alongside utilities.
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

/** Home item for mobile – starts a new chat. */
export const mobileHome: NavItem = {
  name: 'Home',
  href: APP_ROUTES.CHAT,
  id: 'home',
  icon: SquarePen,
  description: 'Start a new chat',
};

/** Items shown as icons in the bottom tab bar (max 3). */
export const mobilePrimaryNavigation: NavItem[] = [
  mobileHome,
  primaryNavigation.find(i => i.id === 'releases')!,
  primaryNavigation.find(i => i.id === 'audience')!,
];

/** Items shown in the expanded "more" menu on mobile. */
export const mobileExpandedNavigation: NavItem[] = [
  primaryNavigation.find(i => i.id === 'tasks')!,
  settingsNavItem,
];
