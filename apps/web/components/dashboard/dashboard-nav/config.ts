import {
  Banknote,
  Bell,
  Home,
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
import type { NavItem } from './types';

export const primaryNavigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/',
    id: 'overview',
    icon: Home,
    description: 'Dashboard overview and quick stats',
  },
  {
    name: 'Profile',
    href: '//profile',
    id: 'links',
    icon: UserCircle,
    description: 'Update your profile and links',
  },
  {
    name: 'Contacts',
    href: '//contacts',
    id: 'contacts',
    icon: IdCard,
    description: 'Manage your team and contact routes',
  },
  {
    name: 'Releases',
    href: '//releases',
    id: 'releases',
    icon: Music,
    description: 'Link out every provider with one smart link',
  },
  {
    name: 'Audience',
    href: '//audience',
    id: 'audience',
    icon: Users,
    description: 'Understand your audience demographics',
  },
];

export const navShortcuts: Record<string, string> = {
  overview: '1',
  links: '2',
  contacts: '3',
  releases: '4',
  audience: '5',
  earnings: '6',
};

export const secondaryNavigation: NavItem[] = [
  {
    name: 'Earnings',
    href: '//earnings',
    id: 'earnings',
    icon: Banknote,
    description: 'Manage tips and monetization',
  },
];

export const settingsNavigation: NavItem[] = [
  {
    name: 'Account',
    href: '/settings',
    id: 'account',
    icon: ShieldCheck,
  },
  {
    name: 'Appearance',
    href: '/settings/appearance',
    id: 'appearance',
    icon: Paintbrush,
  },
  {
    name: 'Notifications',
    href: '/settings/notifications',
    id: 'notifications',
    icon: Bell,
  },
  {
    name: 'Branding',
    href: '/settings/branding',
    id: 'branding',
    icon: Sparkles,
  },
  {
    name: 'Ad Pixels',
    href: '/settings/ad-pixels',
    id: 'ad-pixels',
    icon: Rocket,
  },
  {
    name: 'Billing',
    href: '/settings/billing',
    id: 'billing',
    icon: Banknote,
  },
];

export const adminNavigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/admin',
    id: 'admin_overview',
    icon: ShieldCheck,
    description: 'Internal metrics and operations',
  },
  {
    name: 'Waitlist',
    href: '/admin/waitlist',
    id: 'admin_waitlist',
    icon: UserPlus,
    description: 'Review and manage waitlist signups',
  },
  {
    name: 'Creators',
    href: '/admin/creators',
    id: 'admin_creators',
    icon: Users,
    description: 'Manage creator profiles and verification',
  },
  {
    name: 'Users',
    href: '/admin/users',
    id: 'admin_users',
    icon: UserCircle,
    description: 'Review signed up users and billing status',
  },
  {
    name: 'Activity',
    href: '/admin/activity',
    id: 'admin_activity',
    icon: PieChart,
    description: 'Review recent system and creator activity',
  },
];
