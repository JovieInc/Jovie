'use client';

import { Input } from '@jovie/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from '@/components/shell/SidebarNavItem';
import { cn } from '@/lib/utils';
import {
  filterSettingsGroups,
  isSettingsItemActive,
  SETTINGS_SIDEBAR_GROUPS,
} from './settings-sidebar-config';

// SettingsSidebar — grouped navigation for the settings surface.
// Renders the approved 4-group IA (Profile / Account / Workspace / Billing)
// with a filter-as-you-type search input at the top. Rows reuse the canonical
// shell nav chrome from SidebarNavItem so settings nav can never drift from
// the app sidebar's look.

export interface SettingsSidebarProps {
  readonly className?: string;
}

export function SettingsSidebar({ className }: SettingsSidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useDashboardData();
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () => filterSettingsGroups(SETTINGS_SIDEBAR_GROUPS, query, { isAdmin }),
    [query, isAdmin]
  );

  return (
    <aside
      className={cn('w-52 shrink-0', className)}
      data-testid='settings-sidebar'
    >
      <div className='sticky top-6 space-y-4'>
        <Input
          type='search'
          inputSize='sm'
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder='Search settings'
          aria-label='Search settings'
          data-testid='settings-sidebar-search'
        />
        <nav aria-label='Settings navigation' className='space-y-4'>
          {groups.map(group => {
            const groupActive = group.items.some(item =>
              isSettingsItemActive(pathname, item.href)
            );

            return (
              <div key={group.id} data-testid={`settings-group-${group.id}`}>
                <p
                  className={cn(
                    'mb-1 px-2.5 text-2xs font-medium',
                    groupActive ? 'text-primary-token' : 'text-tertiary-token'
                  )}
                >
                  {group.label}
                </p>
                <ul className='space-y-px pl-2'>
                  {group.items.map(item => {
                    const active = isSettingsItemActive(pathname, item.href);

                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={getSidebarNavRowClassName({
                            active,
                            nested: true,
                            className: 'before:hidden after:hidden',
                          })}
                        >
                          <item.icon
                            className={getSidebarNavIconClassName({
                              active,
                              nested: true,
                            })}
                            strokeWidth={2.25}
                            aria-hidden='true'
                          />
                          <span className='min-w-0 truncate text-left justify-self-start'>
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {groups.length === 0 && (
            <p className='px-2.5 text-xs text-tertiary-token'>
              No settings match your search.
            </p>
          )}
        </nav>
      </div>
    </aside>
  );
}
