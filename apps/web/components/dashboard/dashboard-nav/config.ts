import {
  Banknote,
  Bell,
  CalendarDays,
  IdCard,
  Music,
  Paintbrush,
  PieChart,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react';

import { APP_ROUTES } from '@/constants/routes';

import type { NavItem } from './types';

export const primaryNavigation: NavItem[] = [
  {
    name: 'Profile',
    href: APP_ROUTES.PROFILE,
    id: 'links',
    icon: UserCircle,
    description: 'Update your profile and links',
  },
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
];

export const secondaryNavigation: NavItem[] = [
  {
    name: 'Earnings',
    href: APP_ROUTES.EARNINGS,
    id: 'earnings',
    icon: Banknote,
    description: 'Manage tips and monetization',
  },
];

export const settingsNavigation: NavItem[] = [
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
  {
    name: 'Billing',
    href: APP_ROUTES.SETTINGS_BILLING,
    id: 'billing',
    icon: Banknote,
  },
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
