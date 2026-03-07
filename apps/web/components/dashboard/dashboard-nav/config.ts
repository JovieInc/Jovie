import {
  Banknote,
  CalendarDays,
  Download,
  HandCoins,
  Home,
  IdCard,
  Image as ImageIcon,
  MailCheck,
  MessageSquare,
  Music,
  PieChart,
  Send,
  Settings,
  ShieldCheck,
  SquarePen,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react';

import { APP_ROUTES } from '@/constants/routes';

import type { NavItem } from './types';

// ---------------------------------------------------------------------------
// Shared navigation items – single source of truth for sidebar + mobile
// ---------------------------------------------------------------------------

export const dashboardHome: NavItem = {
  name: 'Dashboard',
  href: APP_ROUTES.DASHBOARD,
  id: 'overview',
  icon: Home,
  description: 'Overview of your dashboard',
};

export const profileNavItem: NavItem = {
  name: 'Profile',
  href: APP_ROUTES.PROFILE,
  id: 'profile',
  icon: UserCircle,
  description: 'Update your profile and links',
};

export const primaryNavigation: NavItem[] = [
  profileNavItem,
  {
    name: 'Releases',
    href: APP_ROUTES.RELEASES,
    id: 'releases',
    icon: Music,
    description: 'Link out every provider with one smart link',
  },
  {
    name: 'Audience',
    href: APP_ROUTES.AUDIENCE,
    id: 'audience',
    icon: Users,
    description: 'Understand your audience demographics',
  },
  {
    name: 'Earnings',
    href: APP_ROUTES.DASHBOARD_EARNINGS,
    id: 'earnings',
    icon: HandCoins,
    description: 'QR codes, tip links, and payout settings',
  },
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
    href: APP_ROUTES.SETTINGS,
    id: 'account',
    icon: ShieldCheck,
  },
  {
    name: 'Billing',
    href: APP_ROUTES.SETTINGS_BILLING,
    id: 'billing',
    icon: Banknote,
  },
];

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

export const adminNavigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: APP_ROUTES.ADMIN,
    id: 'admin_overview',
    icon: ShieldCheck,
    description: 'Internal metrics and operations',
  },
  {
    name: 'Waitlist',
    href: APP_ROUTES.ADMIN_WAITLIST,
    id: 'admin_waitlist',
    icon: UserPlus,
    description: 'Review and manage waitlist signups',
  },
  {
    name: 'Creators',
    href: APP_ROUTES.ADMIN_CREATORS,
    id: 'admin_creators',
    icon: Users,
    description: 'Manage creator profiles and verification',
  },
  {
    name: 'Ingest',
    href: APP_ROUTES.ADMIN_INGEST,
    id: 'admin_ingest',
    icon: Download,
    description: 'Manually ingest creator profiles',
  },
  {
    name: 'Users',
    href: APP_ROUTES.ADMIN_USERS,
    id: 'admin_users',
    icon: UserCircle,
    description: 'Review signed up users and billing status',
  },
  {
    name: 'Feedback',
    href: APP_ROUTES.ADMIN_FEEDBACK,
    id: 'admin_feedback',
    icon: MessageSquare,
    description: 'Review user feedback',
  },
  {
    name: 'Campaigns',
    href: APP_ROUTES.ADMIN_CAMPAIGNS,
    id: 'admin_campaigns',
    icon: Send,
    description: 'Manage creator claim campaigns',
  },
  {
    name: 'Activity',
    href: APP_ROUTES.ADMIN_ACTIVITY,
    id: 'admin_activity',
    icon: PieChart,
    description: 'Review recent system and creator activity',
  },
  {
    name: 'Screenshots',
    href: APP_ROUTES.ADMIN_SCREENSHOTS,
    id: 'admin_screenshots',
    icon: ImageIcon,
    description: 'View generated UI screenshots',
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
export const mobileExpandedNavigation: NavItem[] = [settingsNavItem];
