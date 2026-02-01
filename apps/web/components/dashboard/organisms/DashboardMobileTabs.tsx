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
  UserCircle,
  Users,
} from 'lucide-react';
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

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

export function DashboardMobileTabs({
  className,
}: DashboardMobileTabsProps): React.JSX.Element {
  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      className={cn('lg:hidden', className)}
    />
  );
}
