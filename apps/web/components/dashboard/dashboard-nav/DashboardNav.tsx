'use client';

import { usePathname } from 'next/navigation';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import {
  adminNavigation,
  navShortcuts,
  primaryNavigation,
  secondaryNavigation,
  settingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { ProfileMenuActions } from './ProfileMenuActions';
import type { DashboardNavProps, NavItem } from './types';

const PROFILE_HREF = '/app/dashboard/profile';
const ADMIN_BASE_HREF = '/app/admin';

function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) {
    return true;
  }

  // Admin routes need exact match to avoid false positives
  if (item.href === ADMIN_BASE_HREF) {
    return false;
  }

  return pathname.startsWith(`${item.href}/`);
}

export function DashboardNav(_: DashboardNavProps) {
  const { isAdmin, selectedProfile } = useDashboardData();
  const pathname = usePathname();
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

  function renderNavItem(item: NavItem) {
    const isActive = isItemActive(pathname, item);
    const shortcut = navShortcuts[item.id];
    const isProfileItem = item.href === PROFILE_HREF;

    return (
      <NavMenuItem
        key={item.id}
        item={item}
        isActive={isActive}
        shortcut={shortcut}
        actions={
          isProfileItem && publicProfileHref ? (
            <ProfileMenuActions publicProfileHref={publicProfileHref} />
          ) : null
        }
      />
    );
  }

  function renderSection(items: NavItem[]) {
    return <SidebarMenu>{items.map(renderNavItem)}</SidebarMenu>;
  }

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
