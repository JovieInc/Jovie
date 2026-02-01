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
  readonly className?: string;
}

export function DashboardMobileTabs({ className }: DashboardMobileTabsProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_MENU_ITEMS.some(
    item => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    <>
      <nav
        aria-label='Dashboard tabs'
        className={cn(
          'sticky bottom-0 z-30 border-t border-default bg-bg-base/95 backdrop-blur-lg supports-backdrop-filter:bg-bg-base/80 lg:hidden',
          className
        )}
      >
        <div className='mx-auto flex w-full max-w-md items-center justify-between gap-0.5 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-1.5'>
          {DASHBOARD_TABS.map(tab => {
            const isActive =
              pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 min-h-[56px] text-[10px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-sidebar-accent text-primary-token'
                    : 'text-tertiary-token hover:text-secondary-token active:bg-sidebar-accent/50 active:scale-95'
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center rounded-lg p-1.5 transition-colors duration-150',
                    isActive && 'bg-color-accent/10 text-color-accent'
                  )}
                >
                  <Icon
                    className={cn('size-5', isActive && 'text-color-accent')}
                    aria-hidden='true'
                  />
                </span>
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
              'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 min-h-[56px] text-[10px] font-medium transition-all duration-150',
              isMoreActive || moreOpen
                ? 'bg-sidebar-accent text-primary-token'
                : 'text-tertiary-token hover:text-secondary-token active:bg-sidebar-accent/50 active:scale-95'
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center rounded-lg p-1.5 transition-colors duration-150',
                (isMoreActive || moreOpen) &&
                  'bg-color-accent/10 text-color-accent'
              )}
            >
              <MoreHorizontal
                className={cn(
                  'size-5',
                  (isMoreActive || moreOpen) && 'text-color-accent'
                )}
                aria-hidden='true'
              />
            </span>
            <span className='truncate'>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side='bottom' className='rounded-t-2xl pb-safe'>
          <SheetHeader className='text-left'>
            <SheetTitle className='text-primary-token'>More</SheetTitle>
          </SheetHeader>
          <nav className='grid gap-0.5 py-4' aria-label='Additional navigation'>
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
                    'flex items-center gap-3 rounded-xl px-3 py-3.5 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-sidebar-accent text-primary-token'
                      : 'text-secondary-token hover:bg-sidebar-accent hover:text-primary-token active:scale-[0.98]'
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center rounded-lg p-2 transition-colors',
                      isActive
                        ? 'bg-color-accent/10 text-color-accent'
                        : 'bg-sidebar-accent text-tertiary-token'
                    )}
                  >
                    <Icon className='size-5' aria-hidden='true' />
                  </span>
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
