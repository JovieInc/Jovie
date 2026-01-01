import {
  BanknotesIcon,
  BellIcon,
  ChartPieIcon,
  HomeIcon,
  IdentificationIcon,
  MusicalNoteIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCircleIcon,
  UserPlusIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { NavItem } from './types';

export const primaryNavigation: NavItem[] = [
  {
    name: 'Overview',
    href: '/app/dashboard/overview',
    id: 'overview',
    icon: HomeIcon,
    description: 'Dashboard overview and quick stats',
  },
  {
    name: 'Profile',
    href: '/app/dashboard/profile',
    id: 'links',
    icon: UserCircleIcon,
    description: 'Update your profile and links',
  },
  {
    name: 'Contacts',
    href: '/app/dashboard/contacts',
    id: 'contacts',
    icon: IdentificationIcon,
    description: 'Manage your team and contact routes',
  },
  {
    name: 'Releases',
    href: '/app/dashboard/releases',
    id: 'releases',
    icon: MusicalNoteIcon,
    description: 'Link out every provider with one smart link',
  },
  {
    name: 'Audience',
    href: '/app/dashboard/audience',
    id: 'audience',
    icon: UsersIcon,
    description: 'Understand your audience demographics',
  },
];

export const navShortcuts: Record<string, string> = {
  overview: '1',
  links: '2',
  contacts: '3',
  releases: '4',
  audience: '5',
  tipping: '6',
};

export const secondaryNavigation: NavItem[] = [
  {
    name: 'Earnings',
    href: '/app/dashboard/tipping',
    id: 'tipping',
    icon: BanknotesIcon,
    description: 'Manage tips and monetization',
  },
];

export const settingsNavigation: NavItem[] = [
  {
    name: 'Account',
    href: '/app/settings/account',
    id: 'account',
    icon: ShieldCheckIcon,
  },
  {
    name: 'Appearance',
    href: '/app/settings/appearance',
    id: 'appearance',
    icon: PaintBrushIcon,
  },
  {
    name: 'Notifications',
    href: '/app/settings/notifications',
    id: 'notifications',
    icon: BellIcon,
  },
  {
    name: 'Remove Branding',
    href: '/app/settings/remove-branding',
    id: 'remove-branding',
    icon: SparklesIcon,
  },
  {
    name: 'Ad Pixels',
    href: '/app/settings/ad-pixels',
    id: 'ad-pixels',
    icon: RocketLaunchIcon,
  },
  {
    name: 'Billing',
    href: '/app/settings/billing',
    id: 'billing',
    icon: BanknotesIcon,
  },
];

export const adminNavigation: NavItem[] = [
  {
    name: 'Overview',
    href: '/app/admin',
    id: 'admin_overview',
    icon: ShieldCheckIcon,
    description: 'Internal metrics and operations',
  },
  {
    name: 'Waitlist',
    href: '/app/admin/waitlist',
    id: 'admin_waitlist',
    icon: UserPlusIcon,
    description: 'Review and manage waitlist signups',
  },
  {
    name: 'Creators',
    href: '/app/admin/creators',
    id: 'admin_creators',
    icon: UsersIcon,
    description: 'Manage creator profiles and verification',
  },
  {
    name: 'Users',
    href: '/app/admin/users',
    id: 'admin_users',
    icon: UserCircleIcon,
    description: 'Review signed up users and billing status',
  },
  {
    name: 'Activity',
    href: '/app/admin/activity',
    id: 'admin_activity',
    icon: ChartPieIcon,
    description: 'Review recent system and creator activity',
  },
];
