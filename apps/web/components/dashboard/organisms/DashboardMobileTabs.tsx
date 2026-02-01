'use client';

import {
  Banknote,
  CalendarDays,
  Home,
  IdCard,
  MessageCircle,
  Music,
  PieChart,
  Settings,
  ShieldCheck,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { cn } from '@/lib/utils';

import { LiquidGlassMenu, type LiquidGlassMenuItem } from './LiquidGlassMenu';

const PRIMARY_ITEMS: LiquidGlassMenuItem[] = [
  { id: 'overview', label: 'Dashboard', href: '/app/dashboard', icon: Home },
  {
    id: 'profile',
    label: 'Profile',
    href: '/app/dashboard/profile',
    icon: UserCircle,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: '/app/dashboard/contacts',
    icon: IdCard,
  },
  {
    id: 'audience',
    label: 'Audience',
    href: '/app/dashboard/audience',
    icon: Users,
  },
];

const EXPANDED_ITEMS: LiquidGlassMenuItem[] = [
  {
    id: 'releases',
    label: 'Releases',
    href: '/app/dashboard/releases',
    icon: Music,
  },
  {
    id: 'tour-dates',
    label: 'Tour Dates',
    href: '/app/dashboard/tour-dates',
    icon: CalendarDays,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    href: '/app/dashboard/analytics',
    icon: PieChart,
  },
  {
    id: 'earnings',
    label: 'Earnings',
    href: '/app/dashboard/earnings',
    icon: Banknote,
  },
  {
    id: 'chat',
    label: 'Chat',
    href: '/app/dashboard/chat',
    icon: MessageCircle,
  },
  { id: 'settings', label: 'Settings', href: '/app/settings', icon: Settings },
];

const ADMIN_ITEMS: LiquidGlassMenuItem[] = [
  {
    id: 'admin_overview',
    label: 'Admin Dashboard',
    href: '/app/admin',
    icon: ShieldCheck,
  },
  {
    id: 'admin_waitlist',
    label: 'Waitlist',
    href: '/app/admin/waitlist',
    icon: UserPlus,
  },
  {
    id: 'admin_creators',
    label: 'Creators',
    href: '/app/admin/creators',
    icon: Users,
  },
  {
    id: 'admin_users',
    label: 'Users',
    href: '/app/admin/users',
    icon: UserCircle,
  },
  {
    id: 'admin_activity',
    label: 'Activity',
    href: '/app/admin/activity',
    icon: PieChart,
  },
];

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  const { isAdmin } = useDashboardData();

  // Include admin items in expanded menu when user is admin
  const adminItems = useMemo(
    () => (isAdmin ? ADMIN_ITEMS : undefined),
    [isAdmin]
  );

  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      adminItems={adminItems}
      className={cn('lg:hidden', className)}
    />
  );
}
