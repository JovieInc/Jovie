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
import { Tooltip } from '@/components/atoms/Tooltip';
import { cn } from '@/lib/utils';

const navigation = [
  {
    name: 'Overview',
    href: '/dashboard/overview',
    id: 'overview',
    icon: HomeIcon,
    description: 'Dashboard overview and quick stats',
  },
  {
    name: 'Links',
    href: '/dashboard/links',
    id: 'links',
    icon: LinkIcon,
    description: 'Manage your social and streaming links',
  },
  {
    name: 'Analytics',
    href: '/dashboard/analytics',
    id: 'analytics',
    icon: ChartPieIcon,
    description: 'Track your performance and engagement',
  },
  {
    name: 'Audience',
    href: '/dashboard/audience',
    id: 'audience',
    icon: UsersIcon,
    description: 'Understand your audience demographics',
  },
  {
    name: 'Tipping',
    href: '/dashboard/tipping',
    id: 'tipping',
    icon: BanknotesIcon,
    description: 'Manage tips and monetization',
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    id: 'settings',
    icon: Cog6ToothIcon,
    description: 'Configure your account and preferences',
  },
];

interface DashboardNavProps {
  collapsed?: boolean;
}

export function DashboardNav({ collapsed = false }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <ul role='list' className='flex flex-1 flex-col gap-y-7'>
      <li>
        <ul role='list' className='-mx-2 space-y-1'>
          {navigation.map(item => {
            const isActive =
              pathname === item.href ||
              (pathname === '/dashboard' && item.id === 'overview');

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  isActive
                    ? 'bg-surface-2 text-primary-token ring-1 ring-accent'
                    : 'text-secondary-token hover:text-primary-token hover:bg-surface-2',
                  'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold transition-all duration-300 ease-in-out',
                  collapsed ? 'justify-center' : ''
                )}
              >
                <item.icon
                  className={cn(
                    isActive
                      ? 'text-accent'
                      : 'text-secondary-token group-hover:text-primary-token',
                    'h-6 w-6 shrink-0 transition-colors duration-200'
                  )}
                  aria-hidden='true'
                />
                <span
                  className={cn(
                    'transition-all duration-300 ease-in-out',
                    collapsed
                      ? 'opacity-0 w-0 overflow-hidden'
                      : 'opacity-100 w-auto'
                  )}
                >
                  {item.name}
                </span>
              </Link>
            );

            return (
              <li key={item.name}>
                {collapsed ? (
                  <Tooltip content={`${item.name} - ${item.description}`}>
                    {linkContent}
                  </Tooltip>
                ) : (
                  linkContent
                )}
              </li>
            );
          })}
        </ul>
      </li>
    </ul>
  );
}
