import {
  Banknote,
  Bell,
  CalendarDays,
  Home,
  IdCard,
  Lightbulb,
  Link2,
  Music,
  Music2,
  Paintbrush,
  PieChart,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
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
    name: 'Contacts',
    href: APP_ROUTES.CONTACTS,
    id: 'contacts',
    icon: IdCard,
    description: 'Manage your team and contact routes',
  },
  {
    name: 'Releases',
    href: APP_ROUTES.RELEASES,
    id: 'releases',
    icon: Music,
    description: 'Link out every provider with one smart link',
  },
  {
    name: 'Tour Dates',
    href: APP_ROUTES.TOUR_DATES,
    id: 'tour-dates',
    icon: CalendarDays,
    description: 'Sync and manage your tour dates',
  },
  {
    name: 'Audience',
    href: APP_ROUTES.AUDIENCE,
    id: 'audience',
    icon: Users,
    description: 'Understand your audience demographics',
  },
  {
    name: 'Insights',
    href: APP_ROUTES.INSIGHTS,
    id: 'insights',
    icon: Lightbulb,
    description: 'AI-powered analytics insights and recommendations',
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
    name: 'Appearance',
    href: APP_ROUTES.SETTINGS_APPEARANCE,
    id: 'appearance',
    icon: Paintbrush,
  },
  {
    name: 'Notifications',
    href: APP_ROUTES.SETTINGS_NOTIFICATIONS,
    id: 'notifications',
    icon: Bell,
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
    name: 'Social Links',
    href: APP_ROUTES.SETTINGS_SOCIAL_LINKS,
    id: 'social-links',
    icon: Link2,
  },
  {
    name: 'Music Links',
    href: APP_ROUTES.SETTINGS_MUSIC_LINKS,
    id: 'music-links',
    icon: Music2,
  },
  {
    name: 'Branding',
    href: APP_ROUTES.SETTINGS_BRANDING,
    id: 'branding',
    icon: Sparkles,
  },
  {
    name: 'Ad Pixels',
    href: APP_ROUTES.SETTINGS_AD_PIXELS,
    id: 'ad-pixels',
    icon: Rocket,
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
    name: 'Users',
    href: APP_ROUTES.ADMIN_USERS,
    id: 'admin_users',
    icon: UserCircle,
    description: 'Review signed up users and billing status',
  },
  {
    name: 'Activity',
    href: APP_ROUTES.ADMIN_ACTIVITY,
    id: 'admin_activity',
    icon: PieChart,
    description: 'Review recent system and creator activity',
  },
];

// ---------------------------------------------------------------------------
// Mobile bottom-bar groupings (derived from shared items above)
// ---------------------------------------------------------------------------

/** Items shown as icons in the bottom tab bar (max 4). */
export const mobilePrimaryNavigation: NavItem[] = [
  dashboardHome,
  primaryNavigation[0], // Profile
  primaryNavigation[2], // Releases
  primaryNavigation[4], // Audience
];

/** Items shown in the expanded "more" menu on mobile. */
export const mobileExpandedNavigation: NavItem[] = [
  primaryNavigation[1], // Contacts
  primaryNavigation[3], // Tour Dates
  settingsNavItem,
];
