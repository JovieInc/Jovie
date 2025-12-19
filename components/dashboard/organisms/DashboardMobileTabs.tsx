'use client';

import {
  BanknotesIcon,
  HomeIcon,
  IdentificationIcon,
  UserCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useFeatureGate } from '@statsig/react-bindings';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { cn } from '@/lib/utils';

type DashboardMobileTab = {
  id: string;
  label: string;
  href: string;
  icon: typeof HomeIcon;
};

const DASHBOARD_TABS: DashboardMobileTab[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/app/dashboard/overview',
    icon: HomeIcon,
  },
  {
    id: 'profile',
    label: 'Profile',
    href: '/app/dashboard/profile',
    icon: UserCircleIcon,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: '/app/dashboard/contacts',
    icon: IdentificationIcon,
  },
  {
    id: 'audience',
    label: 'Audience',
    href: '/app/dashboard/audience',
    icon: UsersIcon,
  },
  {
    id: 'earnings',
    label: 'Earnings',
    href: '/app/dashboard/tipping',
    icon: BanknotesIcon,
  },
];

export interface DashboardMobileTabsProps {
  className?: string;
}

export function DashboardMobileTabs({ className }: DashboardMobileTabsProps) {
  const pathname = usePathname();
  const contactsGate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const visibleTabs = contactsGate.value
    ? DASHBOARD_TABS
    : DASHBOARD_TABS.filter(tab => tab.id !== 'contacts');

  return (
    <nav
      aria-label='Dashboard tabs'
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-subtle bg-bg-base/95 backdrop-blur supports-[backdrop-filter]:bg-bg-base/80 lg:hidden',
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
                'flex flex-1 flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-primary-token'
                  : 'text-secondary-token/80 hover:text-primary-token'
              )}
            >
              <Icon className='h-4 w-4' aria-hidden='true' />
              <span className='truncate'>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
