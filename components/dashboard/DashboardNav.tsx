'use client';

import {
  BanknotesIcon,
  ChartPieIcon,
  Cog6ToothIcon,
  HomeIcon,
  LinkIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navigation = [
  {
    name: 'Overview',
    href: '/dashboard/overview',
    id: 'overview',
    icon: HomeIcon,
  },
  {
    name: 'Links',
    href: '/dashboard/links',
    id: 'links',
    icon: LinkIcon,
  },
  {
    name: 'Analytics',
    href: '/dashboard/analytics',
    id: 'analytics',
    icon: ChartPieIcon,
  },
  {
    name: 'Audience',
    href: '/dashboard/audience',
    id: 'audience',
    icon: UsersIcon,
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    id: 'settings',
    icon: Cog6ToothIcon,
  },
  {
    name: 'Tipping',
    href: '/dashboard/tipping',
    id: 'tipping',
    icon: BanknotesIcon,
  },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <ul role='list' className='flex flex-1 flex-col gap-y-7'>
      <li>
        <ul role='list' className='-mx-2 space-y-1'>
          {navigation.map(item => {
            const isActive =
              pathname === item.href ||
              (pathname === '/dashboard' && item.id === 'overview');

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    isActive
                      ? 'bg-surface-2 text-primary-token ring-1 ring-accent'
                      : 'text-secondary-token hover:text-primary-token hover:bg-surface-2',
                    'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                  )}
                >
                  <item.icon
                    className={cn(
                      isActive
                        ? 'text-accent'
                        : 'text-secondary-token group-hover:text-primary-token',
                      'h-6 w-6 shrink-0'
                    )}
                    aria-hidden='true'
                  />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </li>
    </ul>
  );
}
