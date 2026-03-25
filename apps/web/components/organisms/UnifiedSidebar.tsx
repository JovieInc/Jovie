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
import { ProfileSwitcher } from './ProfileSwitcher';
import { NowPlayingCard } from './sidebar/NowPlayingCard';

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
    cachedDisplayName == null
      ? selectedProfile?.displayName?.trim() || undefined
      : cachedDisplayName.trim() || undefined;

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
  hasMultipleProfiles,
}: Readonly<{
  isInSettings: boolean;
  isAdmin: boolean;
  isDashboardOrAdmin: boolean;
  profileHref: string | undefined;
  hasMultipleProfiles: boolean;
}>) {
  return (
    <div className='flex w-full items-center'>
      {isInSettings ? (
        <div className='flex w-full items-center gap-2'>
          <div className='min-w-0 group-data-[collapsible=icon]:hidden'>
            <p className='text-2xs tracking-tight text-sidebar-item-icon/70 [font-weight:var(--font-weight-nav)]'>
              Workspace
            </p>
            <p className='truncate text-app tracking-tight text-sidebar-item-foreground/88 [font-weight:var(--font-weight-nav)]'>
              Settings
            </p>
          </div>
          <Link
            href={APP_ROUTES.DASHBOARD}
            aria-label='Exit settings and return to app'
            className={cn(
              'ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-sidebar-border/70 px-2 text-app tracking-tight text-sidebar-item-foreground/78 transition-[background,color,border-color] duration-normal ease-interactive hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-item-foreground/95 focus-visible:outline-none focus-visible:border-sidebar-border focus-visible:bg-sidebar-accent/60 focus-visible:text-sidebar-item-foreground/95 [font-weight:var(--font-weight-nav)]',
              'rounded-full group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0'
            )}
          >
            <ArrowLeft
              className='size-3 text-sidebar-item-icon/70'
              aria-hidden='true'
            />
            <span className='truncate group-data-[collapsible=icon]:hidden'>
              Exit
            </span>
          </Link>
        </div>
      ) : hasMultipleProfiles && !isAdmin ? (
        <ProfileSwitcher />
      ) : (
        <UserButton
          profileHref={profileHref}
          settingsHref={APP_ROUTES.SETTINGS}
          trigger={
            <button
              type='button'
              aria-label='Open workspace menu'
              className={cn(
                'flex h-7 w-full items-center gap-1.5 rounded-full px-2 transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:bg-sidebar-accent/60',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <BrandLogo
                size={16}
                tone='auto'
                className='rounded-sm shrink-0'
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
          className='ml-auto flex size-7 shrink-0 items-center justify-center rounded-full bg-transparent text-sidebar-item-icon/58 transition-[background,color] duration-normal ease-interactive hover:bg-sidebar-accent/60 hover:text-sidebar-item-foreground/95 focus-visible:outline-none focus-visible:bg-sidebar-accent/60 focus-visible:text-sidebar-item-foreground/95 group-data-[collapsible=icon]:hidden'
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
  const { isAdmin: isUserAdmin, creatorProfiles } = useDashboardData();
  const pathname = usePathname();
  const isInSettings = section === 'settings';
  const isAdmin = section === 'admin';
  const isDashboardOrAdmin = section !== 'settings';
  const hasMultipleProfiles = creatorProfiles.length >= 2;

  const { profileHref } = useProfileData(isDashboardOrAdmin);

  return (
    <Sidebar
      variant='sidebar'
      collapsible='offcanvas'
      className={cn(
        'bg-base',
        '[--sidebar-width:var(--linear-app-sidebar-width)]',
        'transition-[width,transform] duration-normal ease-interactive'
      )}
    >
      <SidebarHeader
        className={cn(
          'relative justify-center gap-0 px-2.5',
          isInSettings ? 'min-h-12 py-2' : 'h-10 py-0.5'
        )}
      >
        <SidebarHeaderNav
          isInSettings={isInSettings}
          isAdmin={isAdmin}
          isDashboardOrAdmin={isDashboardOrAdmin}
          profileHref={profileHref}
          hasMultipleProfiles={hasMultipleProfiles}
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

      <div className='mt-auto shrink-0 bg-sidebar/45 backdrop-blur-[1px]'>
        <div className='px-2 pb-1'>
          <NowPlayingCard />
        </div>
        <SidebarUpgradeBanner />
        <SidebarInstallBanner />

        {isUserAdmin && (
          <div className='pl-2 pr-3.5 pb-2 pt-1'>
            <span className='text-2xs text-sidebar-muted/80 select-none'>
              v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
              {process.env.NEXT_PUBLIC_BUILD_SHA
                ? ` (${process.env.NEXT_PUBLIC_BUILD_SHA})`
                : ''}
            </span>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
