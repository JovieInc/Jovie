'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@jovie/ui';
import { ArrowLeft, ChevronDown, Copy, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardNav } from '@/features/dashboard/dashboard-nav';
import {
  artistSettingsNavigation,
  userSettingsNavigation,
} from '@/features/dashboard/dashboard-nav/config';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { SidebarInstallBanner } from '@/features/feedback/SidebarInstallBanner';
import { SidebarUpgradeBanner } from '@/features/feedback/SidebarUpgradeBanner';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useProfileData } from '@/hooks/useProfileData';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
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
  // Prefer the TanStack Query cache (updated by profile mutations) over
  // the server-rendered context so the sidebar reflects name edits immediately.
  const { data: cachedProfileData } = useDashboardProfileQuery();
  // Cache may hold either the unwrapped DashboardProfile (from optimistic updates)
  // or the { profile: DashboardProfile } envelope (from server refetch).
  const cachedDisplayName =
    cachedProfileData?.displayName ??
    (
      cachedProfileData as unknown as {
        profile?: { displayName?: string | null };
      }
    )?.profile?.displayName;
  // Only fall back to selectedProfile when cache hasn't loaded yet (undefined/null).
  // If cachedDisplayName is empty string, the user intentionally cleared it.
  const artistName =
    cachedDisplayName != null
      ? cachedDisplayName.trim() || undefined
      : selectedProfile?.displayName?.trim() || undefined;

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
      <div>
        <span className='mb-1 block px-2 text-2xs tracking-tight text-sidebar-item-icon/70 group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
          General
        </span>
        <SettingsNavGroup items={userSettingsNavigation} pathname={pathname} />
      </div>
      <div>
        <span className='mb-1 block px-2 text-2xs tracking-tight text-sidebar-item-icon/70 group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
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
            'inline-flex h-6 w-full items-center gap-1.5 rounded-md px-1.5 text-app tracking-tight text-sidebar-item-foreground/75 transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 hover:text-sidebar-item-foreground/95 focus-visible:outline-none focus-visible:bg-sidebar-accent/60 focus-visible:text-sidebar-item-foreground/95 [font-weight:var(--font-weight-nav)]',
            'group-data-[collapsible=icon]:justify-center'
          )}
        >
          <ArrowLeft
            className='size-3 text-sidebar-item-icon/70'
            aria-hidden='true'
          />
          <span className='truncate text-app tracking-tight text-sidebar-item-foreground/80 group-data-[collapsible=icon]:hidden'>
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
                'flex h-6 w-full items-center gap-1.5 rounded-md px-1.5 transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:bg-sidebar-accent/60',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <BrandLogo
                size={13}
                tone='auto'
                className='rounded-[4px] shrink-0'
              />
              <span className='truncate flex-1 text-left text-app tracking-tight text-sidebar-item-foreground/78 group-data-[collapsible=icon]:hidden [font-weight:var(--font-weight-nav)]'>
                {isAdmin ? 'Admin' : 'Jovie'}
              </span>
              <ChevronDown
                className='size-2.5 shrink-0 text-sidebar-item-icon/55 group-data-[collapsible=icon]:hidden'
                aria-hidden='true'
              />
            </button>
          }
        />
      )}

      {!isInSettings && isDashboardOrAdmin && (
        <Link
          href={APP_ROUTES.CHAT}
          aria-label='New thread'
          className='ml-auto flex size-6 shrink-0 items-center justify-center rounded-md bg-transparent text-sidebar-item-icon/58 transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 hover:text-sidebar-item-foreground/95 focus-visible:outline-none focus-visible:bg-sidebar-accent/60 focus-visible:text-sidebar-item-foreground/95 group-data-[collapsible=icon]:hidden'
        >
          <SquarePen className='size-3' />
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
  const { isAdmin: isUserAdmin } = useDashboardData();
  const pathname = usePathname();
  const isInSettings = section === 'settings';
  const isAdmin = section === 'admin';
  const isDashboardOrAdmin = section !== 'settings';

  const { profileHref } = useProfileData(isDashboardOrAdmin);

  return (
    <Sidebar
      variant='sidebar'
      collapsible='offcanvas'
      className={cn(
        'bg-base',
        '[--sidebar-width:244px]',
        'transition-[width,transform] duration-normal ease-interactive'
      )}
    >
      <SidebarHeader className='relative h-10 justify-center gap-0 border-b border-sidebar-border/35 px-2.5 py-0'>
        <SidebarHeaderNav
          isInSettings={isInSettings}
          isAdmin={isAdmin}
          isDashboardOrAdmin={isDashboardOrAdmin}
          profileHref={profileHref}
        />
      </SidebarHeader>

      <SidebarContent className='min-h-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-2.5 pb-2'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-0.5'>
          <SidebarGroupContent className='flex-1'>
            {isDashboardOrAdmin ? (
              <DashboardNav />
            ) : (
              <SettingsNavigation pathname={pathname} section={section} />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className='mt-auto shrink-0 border-t border-sidebar-border/45 bg-sidebar/45 backdrop-blur-[1px]'>
        <SidebarUpgradeBanner />
        <SidebarInstallBanner />

        <div className='pl-2 pr-3.5 pb-3 pt-1'>
          <span className='text-2xs text-sidebar-muted/80 select-none'>
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
            {isUserAdmin && process.env.NEXT_PUBLIC_BUILD_SHA
              ? ` (${process.env.NEXT_PUBLIC_BUILD_SHA})`
              : ''}
          </span>
        </div>
      </div>
    </Sidebar>
  );
}
