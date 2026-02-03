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
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

import { LiquidGlassMenu, type LiquidGlassMenuItem } from './LiquidGlassMenu';

const PRIMARY_ITEMS: LiquidGlassMenuItem[] = [
  {
    id: 'overview',
    label: 'Dashboard',
    href: APP_ROUTES.DASHBOARD,
    icon: Home,
  },
  {
    id: 'profile',
    label: 'Profile',
    href: APP_ROUTES.PROFILE,
    icon: UserCircle,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: APP_ROUTES.CONTACTS,
    icon: IdCard,
  },
  {
    id: 'audience',
    label: 'Audience',
    href: APP_ROUTES.AUDIENCE,
    icon: Users,
  },
];

const EXPANDED_ITEMS: LiquidGlassMenuItem[] = [
  {
    id: 'releases',
    label: 'Releases',
    href: APP_ROUTES.RELEASES,
    icon: Music,
  },
  {
    id: 'tour-dates',
    label: 'Tour Dates',
    href: APP_ROUTES.TOUR_DATES,
    icon: CalendarDays,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    href: APP_ROUTES.ANALYTICS,
    icon: PieChart,
  },
  {
    id: 'earnings',
    label: 'Earnings',
    href: APP_ROUTES.EARNINGS,
    icon: Banknote,
  },
  {
    id: 'chat',
    label: 'Chat',
    href: APP_ROUTES.CHAT,
    icon: MessageCircle,
  },
  {
    id: 'settings',
    label: 'Settings',
    href: APP_ROUTES.SETTINGS,
    icon: Settings,
  },
];

const ADMIN_ITEMS: LiquidGlassMenuItem[] = [
  {
    id: 'admin_overview',
    label: 'Admin Dashboard',
    href: APP_ROUTES.ADMIN,
    icon: ShieldCheck,
  },
  {
    id: 'admin_waitlist',
    label: 'Waitlist',
    href: APP_ROUTES.ADMIN_WAITLIST,
    icon: UserPlus,
  },
  {
    id: 'admin_creators',
    label: 'Creators',
    href: APP_ROUTES.ADMIN_CREATORS,
    icon: Users,
  },
  {
    id: 'admin_users',
    label: 'Users',
    href: APP_ROUTES.ADMIN_USERS,
    icon: UserCircle,
  },
  {
    id: 'admin_activity',
    label: 'Activity',
    href: APP_ROUTES.ADMIN_ACTIVITY,
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
  const router = useRouter();

  // Include admin items in expanded menu when user is admin
  const adminItems = useMemo(
    () => (isAdmin ? ADMIN_ITEMS : undefined),
    [isAdmin]
  );

  const handleSettingsClick = useCallback(() => {
    router.push(APP_ROUTES.SETTINGS);
  }, [router]);

  return (
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      adminItems={adminItems}
      onSettingsClick={handleSettingsClick}
      className={cn('lg:hidden', className)}
    />
  );
}
