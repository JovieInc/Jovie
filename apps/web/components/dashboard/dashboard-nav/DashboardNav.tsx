'use client';

import { Button } from '@jovie/ui';
import { MessageCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { APP_ROUTES } from '@/constants/routes';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import {
  adminNavigation,
  primaryNavigation,
  secondaryNavigation,
  settingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { ProfileMenuActions } from './ProfileMenuActions';
import type { DashboardNavProps, NavItem } from './types';

function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) {
    return true;
  }

  // Admin routes need exact match to avoid false positives
  if (item.href === APP_ROUTES.ADMIN) {
    return false;
  }

  return pathname.startsWith(`${item.href}/`);
}

export function DashboardNav(_: DashboardNavProps) {
  const { isAdmin, selectedProfile } = useDashboardData();
  const pathname = usePathname();
  const router = useRouter();

  // Fetch chat history for sidebar
  const { data: conversations } = useChatConversationsQuery({ limit: 5 });

  // Debug: track isAdmin changes in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DashboardNav] isAdmin changed:', isAdmin);
    }
  }, [isAdmin]);

  const username =
    selectedProfile?.usernameNormalized ?? selectedProfile?.username;
  const publicProfileHref = username ? `/${username}` : undefined;

  // Memoize profile actions to prevent creating new JSX on every render
  const profileActions = useMemo(
    () =>
      publicProfileHref ? (
        <ProfileMenuActions publicProfileHref={publicProfileHref} />
      ) : null,
    [publicProfileHref]
  );

  // Memoize filtered items to prevent creating new arrays on every render
  // Note: Tour dates is now always visible (unflagged)
  const primaryItems = useMemo(() => primaryNavigation, []);

  const secondaryItems = secondaryNavigation;

  const isInSettings = pathname.startsWith('/app/settings');

  // Memoize nav sections to prevent creating new objects on every render
  const navSections = useMemo(
    () =>
      isInSettings
        ? [{ key: 'settings', items: settingsNavigation }]
        : [
            { key: 'primary', items: primaryItems },
            { key: 'secondary', items: secondaryItems },
          ],
    [isInSettings, primaryItems, secondaryItems]
  );

  // Memoize renderNavItem to prevent creating new functions on every render
  const renderNavItem = useCallback(
    (item: NavItem, _index: number) => {
      const isActive = isItemActive(pathname, item);
      const shortcut = NAV_SHORTCUTS[item.id];
      const isProfileItem = item.href === APP_ROUTES.PROFILE;

      return (
        <NavMenuItem
          key={item.id}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          actions={isProfileItem ? profileActions : null}
        />
      );
    },
    [pathname, profileActions]
  );

  // Memoize renderSection to prevent creating new functions on every render
  const renderSection = useCallback(
    (items: NavItem[]) => (
      <SidebarMenu>
        {items.map((item, index) => renderNavItem(item, index))}
      </SidebarMenu>
    ),
    [renderNavItem]
  );

  // Handle new chat button click
  const handleNewChat = useCallback(() => {
    // Navigate to chat page without a conversation ID (starts new chat)
    router.push(APP_ROUTES.CHAT);
  }, [router]);

  return (
    <nav
      className='flex flex-1 flex-col px-2'
      aria-label='Dashboard navigation'
    >
      {/* New Chat Button */}
      {!isInSettings && (
        <div className='mb-2 px-1'>
          <Button
            variant='secondary'
            size='sm'
            className='w-full justify-start gap-2'
            onClick={handleNewChat}
          >
            <Plus className='h-4 w-4' />
            New Chat
          </Button>
        </div>
      )}

      <SidebarGroup className='mb-1'>
        <SidebarGroupContent className='space-y-1'>
          {navSections.map((section, index) => (
            <div key={section.key} data-nav-section>
              {/* Section divider for visual separation (except for first section) */}
              {index > 0 && (
                <div className='my-2 mx-1 border-t border-default' />
              )}
              {renderSection(section.items)}
            </div>
          ))}
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Chat History Section */}
      {!isInSettings && conversations && conversations.length > 0 && (
        <div
          className='mt-2 pt-2 mx-1 border-t border-default'
          data-testid='chat-history-section'
        >
          <SidebarCollapsibleGroup label='Recent Chats' defaultOpen>
            <SidebarMenu>
              {conversations.map(conversation => {
                const isActive = pathname === `${APP_ROUTES.CHAT}/${conversation.id}`;
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className='h-auto py-2'
                    >
                      <Link href={`${APP_ROUTES.CHAT}/${conversation.id}`}>
                        <MessageCircle className='h-4 w-4 shrink-0' />
                        <span className='truncate text-sm'>
                          {conversation.title || 'Untitled chat'}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarCollapsibleGroup>
        </div>
      )}

      {isAdmin && !isInSettings && (
        <div
          className='mt-2 pt-2 mx-1 border-t border-default'
          data-testid='admin-nav-section'
        >
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            {renderSection(adminNavigation)}
          </SidebarCollapsibleGroup>
        </div>
      )}
    </nav>
  );
}
