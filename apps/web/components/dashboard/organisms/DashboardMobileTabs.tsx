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
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

import { LiquidGlassMenu, type LiquidGlassMenuItem } from './LiquidGlassMenu';

/**
 * Primary navigation items shown in the tab bar
 */
const PRIMARY_ITEMS: LiquidGlassMenuItem[] = [
  {
    id: 'overview',
    label: 'Dashboard',
    href: '/app/dashboard',
    icon: Home,
  },
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

/**
 * Additional items shown in the expanded menu
 */
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
  {
    id: 'settings',
    label: 'Settings',
    href: '/app/settings',
    icon: Settings,
  },
];

export interface DashboardMobileTabsProps {
  readonly className?: string;
}

/**
 * DashboardMobileTabs - Mobile navigation with liquid glass expandable menu
 *
 * Features:
 * - Fixed bottom tab bar with primary navigation
 * - Expandable menu with all navigation options
 * - Liquid glass visual effect (frosted glass with blur)
 * - Smooth animations and touch feedback
 */
export function DashboardMobileTabs({ className }: DashboardMobileTabsProps) {
  const router = useRouter();

  const handleSettingsClick = useCallback(() => {
    router.push('/app/settings');
  }, [router]);

  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      onSettingsClick={handleSettingsClick}
      className={cn('lg:hidden', className)}
    />
  );
}
