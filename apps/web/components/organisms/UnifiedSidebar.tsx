'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@jovie/ui';
import { ArrowLeft, Copy, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import {
  artistSettingsNavigation,
  userSettingsNavigation,
} from '@/components/dashboard/dashboard-nav/config';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useProfileData } from '@/hooks/useProfileData';
import { cn } from '@/lib/utils';

export interface UnifiedSidebarProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
}

/** Render a group of nav items */
function SettingsNavGroup({
  items,
  pathname,
}: Readonly<{
  items: NavItem[];
  pathname: string;
}>) {
  return (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <ContextMenu key={item.id}>
            <ContextMenuTrigger asChild>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.name}
                  className='font-medium'
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className='flex w-full min-w-0 items-center gap-2'
                  >
                    <item.icon className='size-3.5' />
                    <span className='truncate'>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={async () => {
                  const origin =
                    globalThis.window === undefined
                      ? BASE_URL
                      : globalThis.location.origin;
                  const url = `${origin}${item.href}`;
                  const ok = await copyToClipboard(url);
                  if (ok) {
                    toast.success('Link copied to clipboard');
                  } else {
                    toast.error('Failed to copy link');
                  }
                }}
              >
                <Copy className='mr-2 h-4 w-4' />
                Copy link
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </SidebarMenu>
  );
}

/** Navigation list for settings section — grouped with labels like Linear */
function SettingsNavigation({
  pathname,
  section,
}: {
  pathname: string;
  section: string;
}) {
  const { selectedProfile } = useDashboardData();
  const artistName = selectedProfile?.displayName?.trim() || undefined;

  // Replace "Profile" label with the artist's display name when available
  const artistItems = useMemo(() => {
    if (!artistName) return artistSettingsNavigation;
    return artistSettingsNavigation.map(item =>
      item.id === 'artist-profile' ? { ...item, name: artistName } : item
    );
  }, [artistName]);

  return (
    <nav
      aria-label={`${section} navigation`}
      className='flex flex-1 flex-col gap-3 overflow-hidden'
    >
      <SettingsNavGroup items={userSettingsNavigation} pathname={pathname} />
      <div className='mx-2 group-data-[collapsible=icon]:mx-0' />
      <div>
        <span className='mb-1 block px-2 text-app text-sidebar-muted group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
          {artistName || 'Artist'}
        </span>
        <SettingsNavGroup items={artistItems} pathname={pathname} />
      </div>
    </nav>
  );
}

/** Workspace button (logo + name) or back button for settings */
function SidebarHeaderNav({
  isInSettings,
  isAdmin,
  isDashboardOrAdmin,
  profileHref,
}: Readonly<{
  isInSettings: boolean;
  isAdmin: boolean;
  isDashboardOrAdmin: boolean;
  profileHref: string | undefined;
}>) {
  return (
    <div className='flex w-full items-center'>
      {isInSettings ? (
        <Link
          href={APP_ROUTES.DASHBOARD}
          aria-label='Back to dashboard'
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded px-1 text-app text-sidebar-item-foreground transition-[background] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent [font-weight:var(--font-weight-nav)]',
            'group-data-[collapsible=icon]:justify-center'
          )}
        >
          <ArrowLeft className='size-4' aria-hidden='true' />
          <span className='truncate group-data-[collapsible=icon]:hidden'>
            Back to app
          </span>
        </Link>
      ) : (
        <UserButton
          profileHref={profileHref}
          settingsHref={APP_ROUTES.SETTINGS}
          trigger={
            <button
              type='button'
              aria-label='Open workspace menu'
              className={cn(
                'flex h-7 items-center gap-1.5 rounded px-1 transition-[background] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <BrandLogo size={16} tone='auto' className='size-4 shrink-0' />
              <span className='text-app text-white group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
                {isAdmin ? 'Admin' : 'Jovie'}
              </span>
            </button>
          }
        />
      )}

      {!isInSettings && isDashboardOrAdmin && (
        <Link
          href={APP_ROUTES.CHAT}
          aria-label='New thread'
          className='ml-auto flex size-7 shrink-0 items-center justify-center rounded bg-transparent text-sidebar-foreground transition-[background] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent group-data-[collapsible=icon]:hidden'
        >
          <SquarePen className='size-4' />
        </Link>
      )}
    </div>
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Header workspace button (logo + name) opens user menu dropdown (Linear-style).
 * Settings section shows a back button instead.
 * No footer — user menu lives in the header.
 */
export function UnifiedSidebar({ section }: UnifiedSidebarProps) {
  const { state, isMobile, setOpen } = useSidebar();
  const isCollapsed = state === 'closed';
  const pathname = usePathname();
  const isInSettings = section === 'settings';
  const isAdmin = section === 'admin';
  const isDashboardOrAdmin = section !== 'settings';

  const { profileHref } = useProfileData(isDashboardOrAdmin);

  return (
    <Sidebar
      variant='sidebar'
      collapsible='icon'
      className={cn(
        'bg-base',
        '[--sidebar-width:232px]',
        'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
      )}
    >
      <SidebarHeader className='relative h-9 justify-center gap-0 px-2 pt-2 pb-0'>
        <SidebarHeaderNav
          isInSettings={isInSettings}
          isAdmin={isAdmin}
          isDashboardOrAdmin={isDashboardOrAdmin}
          profileHref={profileHref}
        />
      </SidebarHeader>

      <SidebarContent className='flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pl-2 pr-3.5'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex-1'>
            {isDashboardOrAdmin ? (
              <DashboardNav />
            ) : (
              <SettingsNavigation pathname={pathname} section={section} />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className='pl-2 pr-3.5 pb-3.5 pt-1 group-data-[collapsible=icon]:hidden'>
        <span className='text-[11px] text-sidebar-muted select-none'>
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
          {process.env.NEXT_PUBLIC_BUILD_SHA
            ? ` (${process.env.NEXT_PUBLIC_BUILD_SHA})`
            : ''}
        </span>
      </div>

      <SidebarRail />

      {isCollapsed && !isMobile && (
        <button
          type='button'
          aria-label='Expand sidebar'
          onClick={() => setOpen(true)}
          className='absolute inset-0 z-10 cursor-pointer bg-transparent'
          style={{ pointerEvents: 'auto' }}
        />
      )}
    </Sidebar>
  );
}
