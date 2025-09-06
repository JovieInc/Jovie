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
import { Divider } from '@/components/atoms/Divider';
import { Tooltip } from '@/components/atoms/Tooltip';
import { cn } from '@/lib/utils';

// Primary Navigation - Core features
const primaryNavigation = [
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
];

// Keyboard shortcut hints shown in tooltips (collapsed sidebar)
// Display-only for now; actual hotkeys can be wired separately.
const navShortcuts: Record<string, string> = {
  overview: '1',
  links: '2',
  analytics: '3',
  audience: '4',
  tipping: '5',
  settings: '6',
};

// Secondary Navigation - Additional features
const secondaryNavigation = [
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

  const renderNavSection = (
    items: typeof primaryNavigation,
    isPrimary: boolean
  ) => (
    <ul
      role='list'
      className={cn('-mx-2', collapsed ? 'space-y-1.5' : 'space-y-1')}
    >
      {items.map(item => {
        const isActive =
          pathname === item.href ||
          (pathname === '/dashboard' && item.id === 'overview');

        const linkContent = (
          <Link
            href={item.href}
            className={cn(
              // Apple-style active state - solid pill highlight
              isActive
                ? 'bg-accent/10 text-primary-token shadow-sm border border-subtle'
                : 'text-secondary-token hover:text-primary-token hover:bg-surface-2/80',
              // Base styles with perfect alignment
              'group flex items-center rounded-lg transition-all duration-200 ease-in-out relative',
              // Focus states
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              // Responsive padding and spacing
              collapsed ? 'p-2.5 justify-center' : 'px-3 py-2.5 gap-3',
              // Typography hierarchy
              isPrimary ? 'font-semibold text-sm' : 'font-medium text-sm',
              // Hover animations
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            {/* Active state glow/halo effect */}
            {isActive && (
              <div className='absolute inset-0 bg-accent/5 rounded-lg animate-pulse' />
            )}

            <item.icon
              className={cn(
                isActive
                  ? 'text-accent'
                  : isPrimary
                    ? 'text-secondary-token group-hover:text-primary-token'
                    : 'text-tertiary-token group-hover:text-secondary-token',
                'h-5 w-5 shrink-0 transition-all duration-200',
                // Hover scale animation
                'group-hover:scale-110 group-active:scale-95'
              )}
              aria-hidden='true'
            />

            <span
              className={cn(
                'transition-all duration-200 ease-in-out truncate',
                collapsed
                  ? 'opacity-0 w-0 overflow-hidden'
                  : 'opacity-100 w-auto',
                // Typography colors
                isActive
                  ? 'text-primary-token'
                  : isPrimary
                    ? 'text-primary-token'
                    : 'text-secondary-token'
              )}
            >
              {item.name}
            </span>
          </Link>
        );

        return (
          <li key={item.name}>
            {collapsed ? (
              <Tooltip
                content={item.name}
                shortcut={navShortcuts[item.id]}
                placement='right'
              >
                {linkContent}
              </Tooltip>
            ) : (
              linkContent
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className='flex flex-1 flex-col'>
      {/* Primary Navigation Block */}
      <div className='mb-6'>{renderNavSection(primaryNavigation, true)}</div>

      {/* Divider */}
      <Divider className='mb-6' inset={!collapsed} />

      {/* Secondary Navigation Block */}
      <div className='mb-4'>{renderNavSection(secondaryNavigation, false)}</div>
    </nav>
  );
}
