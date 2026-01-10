'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import { DashboardRemoveBrandingCard } from '@/components/dashboard/molecules/DashboardRemoveBrandingCard';
import { OptimizedAvatar } from '@/components/molecules/OptimizedAvatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarShortcutHint,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UserButton } from '@/components/organisms/user-button';
import { cn } from '@/lib/utils';

export interface UnifiedSidebarProps {
  section: 'admin' | 'dashboard' | 'settings';
  navigation: NavItem[];
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Adapts dynamically based on section:
 * - Admin: Shows "Admin Console" label
 * - Settings: Shows back button to dashboard
 * - Dashboard: Shows just logo
 *
 * Footer shows:
 * - Admin: (no footer - cleaner interface)
 * - Dashboard: Branding card + UserButton
 * - Settings: (no footer)
 *
 * Replaces: DashboardSidebar, AdminSidebar
 */
export function UnifiedSidebar({ section, navigation }: UnifiedSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === 'closed';
  const pathname = usePathname();
  const isInSettings = section === 'settings';
  const isDashboard = section === 'dashboard';
  const isAdmin = section === 'admin';

  // Dashboard-specific data (needed for both dashboard and admin sections)
  // Always call hook unconditionally to avoid Rules of Hooks violation
  const dashboardData = useDashboardData();
  const username = dashboardData
    ? (dashboardData.selectedProfile?.usernameNormalized ??
      dashboardData.selectedProfile?.username)
    : undefined;
  const profileHref = username ? `/${username}` : undefined;
  const displayName = dashboardData
    ? dashboardData.selectedProfile?.displayName?.trim() ||
      dashboardData.selectedProfile?.username ||
      'Your profile'
    : 'Your profile';
  const avatarUrl = dashboardData?.selectedProfile?.avatarUrl;

  return (
    <Sidebar
      variant='sidebar'
      collapsible='icon'
      className={cn(
        'bg-base',
        '[--sidebar-width:236px]',
        '[--sidebar-width-icon:0px]',
        'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
      )}
    >
      <SidebarHeader className='relative pb-0'>
        <div className='group/toggle flex items-center gap-2 px-2 py-1'>
          {/* Logo/Header Area - varies by section */}
          {isInSettings ? (
            // Settings: Back button to dashboard
            <Link
              href='/app/dashboard'
              aria-label='Back to dashboard'
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <ArrowLeft className='h-4 w-4' aria-hidden='true' />
              <span className='truncate group-data-[collapsible=icon]:hidden'>
                Back
              </span>
            </Link>
          ) : (
            // Dashboard & Admin: Just logo
            <Link
              href={isAdmin ? '/app/admin' : '/app/dashboard'}
              aria-label={isAdmin ? 'Go to admin' : 'Go to dashboard'}
              className={cn(
                'flex h-9 flex-1 items-center gap-3 rounded-md px-1 py-1 transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                'group-data-[collapsible=icon]:justify-center'
              )}
            >
              <div className='flex items-center justify-center'>
                <BrandLogo size={16} tone='auto' className='h-5 w-5' />
              </div>
              <span className='sr-only group-data-[collapsible=icon]:hidden'>
                {isAdmin ? 'Admin' : 'Dashboard'}
              </span>
            </Link>
          )}

          {/* Collapse trigger - show for dashboard/admin, not settings */}
          {!isInSettings && (
            <div className='group/shortcut ml-auto flex items-center gap-2'>
              <SidebarShortcutHint className='hidden opacity-0 transition-opacity duration-200 lg:inline-flex group-hover/shortcut:opacity-100' />
              <SidebarTrigger
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className={cn(
                  'h-8 w-8 shrink-0 border border-sidebar-border bg-sidebar/70 text-secondary-token hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  'group-data-[state=closed]:hidden'
                )}
              />
            </div>
          )}
        </div>

        {/* Mobile profile card - for dashboard and admin */}
        {(isDashboard || isAdmin) && (
          <div className='px-2 pb-3 pt-2 lg:hidden'>
            <div className='flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar/40 p-3'>
              <OptimizedAvatar
                src={avatarUrl}
                alt={displayName}
                size={64}
                className='h-10 w-10'
              />
              <div className='min-w-0'>
                <p className='truncate text-sm font-semibold text-sidebar-foreground'>
                  {displayName}
                </p>
                {username ? (
                  <p className='truncate text-xs text-sidebar-muted'>
                    @{username}
                  </p>
                ) : null}
              </div>
            </div>
            {profileHref ? (
              <div className='mt-3 flex items-center gap-2'>
                <Button
                  asChild
                  size='sm'
                  variant='secondary'
                  className='flex-1 min-h-[44px]'
                >
                  <Link
                    href={profileHref}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    View profile
                  </Link>
                </Button>
                <CopyToClipboardButton
                  relativePath={profileHref}
                  idleLabel='Copy link'
                  successLabel='Copied'
                  errorLabel='Copy failed'
                  className='flex-1 min-h-[44px]'
                />
              </div>
            ) : null}
          </div>
        )}
      </SidebarHeader>

      {/* Navigation Content */}
      <SidebarContent className='flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex-1'>
            {/* Dashboard and Admin use DashboardNav, Settings uses custom */}
            {isDashboard || isAdmin ? (
              <DashboardNav />
            ) : (
              <nav
                aria-label={`${section} navigation`}
                className='flex flex-1 flex-col overflow-hidden'
              >
                <SidebarMenu>
                  {navigation.map(item => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className='font-medium'
                        >
                          <Link
                            href={item.href}
                            aria-current={isActive ? 'page' : undefined}
                            className='flex w-full min-w-0 items-center gap-3'
                          >
                            <item.icon className='size-4' />
                            <span className='truncate'>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </nav>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer - for dashboard and admin (branding + user button) */}
      {(isDashboard || isAdmin) && (
        <SidebarFooter className='mt-auto'>
          <SidebarSeparator className='mx-0' />
          <div className='px-2 pt-3 group-data-[collapsible=icon]:hidden'>
            <DashboardRemoveBrandingCard />
          </div>
          <div className='px-2 py-3'>
            <div
              className={cn(
                isCollapsed
                  ? 'flex items-center justify-center'
                  : 'flex items-center'
              )}
            >
              <UserButton
                showUserInfo={!isCollapsed}
                profileHref={profileHref}
                settingsHref='/app/settings'
              />
            </div>
          </div>
        </SidebarFooter>
      )}

      <SidebarRail />
    </Sidebar>
  );
}
