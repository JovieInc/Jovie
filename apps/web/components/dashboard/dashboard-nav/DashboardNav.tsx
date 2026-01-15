'use client';

import { Kbd } from '@jovie/ui';
import { Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuActions,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { track } from '@/lib/analytics';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import {
  adminNavigation,
  navShortcuts,
  primaryNavigation,
  secondaryNavigation,
  settingsNavigation,
} from './config';
import type { DashboardNavProps, NavItem } from './types';
import { copyToClipboard } from './utils';

export function DashboardNav(_props: DashboardNavProps) {
  const { isAdmin, selectedProfile } = useDashboardData();
  const pathname = usePathname();
  const notifications = useNotifications();
  const contactsGate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const username =
    selectedProfile?.usernameNormalized ?? selectedProfile?.username;
  const publicProfileHref = username ? `/${username}` : undefined;
  const primaryItems = contactsGate.value
    ? primaryNavigation
    : primaryNavigation.filter(item => item.id !== 'contacts');

  const isInSettings = pathname.startsWith('/app/settings');
  const navSections = isInSettings
    ? [{ key: 'settings', items: settingsNavigation }]
    : [
        { key: 'primary', items: primaryItems },
        { key: 'secondary', items: secondaryNavigation },
      ];

  const renderSection = (items: NavItem[]) => (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href ||
          (pathname.startsWith(`${item.href}/`) && item.href !== '/app/admin');
        const shortcut = navShortcuts[item.id];
        const tooltip = shortcut
          ? {
              children: (
                <div className='flex items-center gap-2'>
                  <span>{item.name}</span>
                  <Kbd className='text-[10px] px-1.5 py-0.5'>{shortcut}</Kbd>
                </div>
              ),
            }
          : item.name;

        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className='flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0'
              >
                <item.icon className='size-4' aria-hidden='true' />
                <span className='truncate group-data-[collapsible=icon]:hidden'>
                  {item.name}
                </span>
              </Link>
            </SidebarMenuButton>
            {item.href === '/app/dashboard/profile' && publicProfileHref ? (
              <SidebarMenuActions showOnHover>
                <SidebarMenuAction
                  type='button'
                  aria-label='Copy public profile link'
                  onClick={async () => {
                    const url = `${getBaseUrl()}${publicProfileHref}`;
                    const success = await copyToClipboard(url);

                    if (success) {
                      notifications.success('Copied to clipboard');
                      track('profile_copy_url_click', {
                        status: 'success',
                        source: 'dashboard_nav',
                      });
                    } else {
                      notifications.error('Failed to copy');
                      track('profile_copy_url_click', {
                        status: 'error',
                        source: 'dashboard_nav',
                      });
                    }
                  }}
                >
                  <Copy aria-hidden='true' className='size-4' />
                </SidebarMenuAction>
                <SidebarMenuAction asChild>
                  <Link
                    href={publicProfileHref}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-label='Open public profile in a new tab'
                  >
                    <ExternalLink aria-hidden='true' className='size-4' />
                  </Link>
                </SidebarMenuAction>
              </SidebarMenuActions>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <nav className='flex flex-1 flex-col' aria-label='Dashboard navigation'>
      <SidebarGroup className='mb-1 space-y-1.5'>
        <SidebarGroupContent className='space-y-1'>
          {navSections.map(section => (
            <div key={section.key} data-nav-section>
              {renderSection(section.items)}
            </div>
          ))}
        </SidebarGroupContent>
      </SidebarGroup>
      {isAdmin && !isInSettings && (
        <div className='mt-4'>
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            {renderSection(adminNavigation)}
          </SidebarCollapsibleGroup>
        </div>
      )}
    </nav>
  );
}
