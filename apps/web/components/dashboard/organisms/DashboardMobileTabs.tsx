'use client';

import {
  Banknote,
  CalendarDays,
  Home,
  IdCard,
  type LucideIcon,
  MessageCircle,
  MoreHorizontal,
  Music,
  PieChart,
  Settings,
  UserCircle,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/atoms/Sheet';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import { cn } from '@/lib/utils';

type DashboardMobileTab = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

const DASHBOARD_TABS: DashboardMobileTab[] = [
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

const MORE_MENU_ITEMS: DashboardMobileTab[] = [
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
  className?: string;
}

export function DashboardMobileTabs({ className }: DashboardMobileTabsProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const contactsGate = useFeatureGate(STATSIG_FLAGS.CONTACTS);

  const visibleTabs = contactsGate.value
    ? DASHBOARD_TABS
    : DASHBOARD_TABS.filter(tab => tab.id !== 'contacts');

  const isMoreActive = MORE_MENU_ITEMS.some(
    item => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    <>
      <nav
        aria-label='Dashboard tabs'
        className={cn(
          'sticky bottom-0 z-30 border-t border-subtle bg-bg-base/95 backdrop-blur supports-backdrop-filter:bg-bg-base/80 lg:hidden',
          className
        )}
      >
        <div className='mx-auto flex w-full max-w-md items-center justify-between gap-1 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2'>
          {visibleTabs.map(tab => {
            const isActive =
              pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-h-[52px] text-[11px] font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-primary-token'
                    : 'text-secondary-token/80 hover:text-primary-token active:bg-sidebar-accent/50'
                )}
              >
                <Icon className='h-5 w-5' aria-hidden='true' />
                <span className='truncate'>{tab.label}</span>
              </Link>
            );
          })}
          <button
            type='button'
            onClick={() => setMoreOpen(true)}
            aria-label='More options'
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-h-[52px] text-[11px] font-medium transition-colors',
              isMoreActive || moreOpen
                ? 'bg-sidebar-accent text-primary-token'
                : 'text-secondary-token/80 hover:text-primary-token active:bg-sidebar-accent/50'
            )}
          >
            <MoreHorizontal className='h-5 w-5' aria-hidden='true' />
            <span className='truncate'>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side='bottom' className='rounded-t-2xl pb-safe'>
          <SheetHeader className='text-left'>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <nav className='grid gap-1 py-4' aria-label='Additional navigation'>
            {MORE_MENU_ITEMS.map(item => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-primary-token'
                      : 'text-secondary-token hover:bg-sidebar-accent/50 hover:text-primary-token'
                  )}
                >
                  <Icon className='h-5 w-5' aria-hidden='true' />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
