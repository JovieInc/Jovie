'use client';

// @coverage-via apps/web/tests/unit/components/organisms/UnifiedSidebar.library.test.tsx

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { AskJovieMark } from '@/components/ask-jovie/AskJovie';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button';
import { WorkspaceSelector } from '@/components/molecules/WorkspaceSelector';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  useSidebar,
} from '@/components/organisms/sidebar';
import { SidebarIdentityGroup } from '@/components/organisms/sidebar-identity-group';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import { RailStagedContent } from '@/components/shell/RailStagedContent';
import {
  SHELL_RAIL_ALLOCATION,
  SHELL_RAIL_LABEL,
} from '@/components/shell/rail-motion';
import { SidebarInboxLink } from '@/components/shell/SidebarInboxLink';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { useShellSidebarOverride } from '@/contexts/ShellSidebarOverrideContext';
import { DashboardNav } from '@/features/dashboard/dashboard-nav';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { ProfileCompletionCard } from '@/features/dashboard/molecules/ProfileCompletionCard';
import { useProfileData } from '@/hooks/useProfileData';
import { APP_SHELL_WORKSPACES } from '@/lib/app-shell/workspaces';
import { BRAND_WORDMARKS, type BrandVariant } from '@/lib/brand/tokens';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';
import type { AppShellSection } from '@/types/app-shell';
import {
  OPERATOR_RAIL_PINNED_GROUP_CLASS,
  resolveOperatorNavGroup,
  useOperatorGroupOpen,
} from './operator-nav-group';
import {
  isOperatorNavigationHrefActive,
  OPERATOR_NAV_GROUP_LABEL,
  OPERATOR_NAV_SECTIONS,
  type OperatorNavSection,
} from './operator-navigation';
import { IdentitySwitcher } from './ProfileSwitcher';
import { SettingsNavGroup, SettingsNavigation } from './SettingsSidebarNav';
import { SidebarDockBridge } from './SidebarDockBridge';

// Founder-only (OV) block: split out so creator routes never ship it.
const OperatorListsNav = dynamic(() =>
  import('./OperatorListsNav').then(module => module.OperatorListsNav)
);

export interface UnifiedSidebarProps {
  readonly section: AppShellSection;
  /** Brand skin for the shell chrome. 'ov' is the internal/admin skin (JOV-4083). */
  readonly variant?: BrandVariant;
  /** Only transfer the collapsed browser action when a header is present. */
  readonly headerOwnsCollapsedToggle?: boolean;
}

/**
 * One operator nav group. Tools is collapsed by default (Tim 2026-10-21: Ovie
 * is one Home), remembers the viewer's choice, and is always open while one
 * of its destinations is active so the current page is never hidden.
 */
function OperatorNavGroup({
  section,
  pathname,
}: Readonly<{
  readonly section: OperatorNavSection;
  readonly pathname: string;
}>) {
  const queryClient = useQueryClient();
  const prefetchShipping = (item: NavItem) => {
    if (item.href !== APP_ROUTES.ADMIN_SHIPPING) return;
    void import('@/lib/queries/shipping-state')
      .then(m => queryClient.prefetchQuery(m.shippingStateQueryOptions))
      .catch(() => undefined); // A missed prefetch must not reload the page.
  };
  const { stored, toggle } = useOperatorGroupOpen(section);
  const { state, isMobile } = useSidebar();
  const isActive = (item: NavItem) =>
    isOperatorNavigationHrefActive(pathname, item.href);
  const { holdsActive, open, items, pinnedInRail } = resolveOperatorNavGroup({
    collapsible: section.collapsible,
    items: section.items,
    isActive,
    stored,
    railCollapsed: state === 'closed' && !isMobile,
  });
  const groupId = `ov-nav-${section.id}`;
  return (
    <div
      data-testid={`ov-nav-section-${section.id}`}
      className={cn(pinnedInRail && OPERATOR_RAIL_PINNED_GROUP_CLASS)}
    >
      {section.label && section.collapsible ? (
        <button
          type='button'
          className={cn(
            OPERATOR_NAV_GROUP_LABEL,
            SHELL_RAIL_LABEL,
            'flex w-full items-center gap-1 text-left hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
          )}
          aria-expanded={open}
          aria-controls={groupId}
          disabled={holdsActive}
          onClick={toggle}
        >
          <ChevronRight
            aria-hidden='true'
            className={cn(
              'size-3 transition-transform duration-subtle motion-reduce:transition-none',
              open && 'rotate-90'
            )}
          />
          {section.label}
        </button>
      ) : section.label ? (
        <span className={cn(OPERATOR_NAV_GROUP_LABEL, SHELL_RAIL_LABEL)}>
          {section.label}
        </span>
      ) : null}
      <div id={groupId} hidden={!open}>
        <SettingsNavGroup
          items={items}
          pathname={pathname}
          isItemActive={isActive}
          onPrefetch={prefetchShipping}
        />
      </div>
    </div>
  );
}

/** Dedicated operator navigation; customer DashboardNav stays customer-only. */
function OperatorNavigation({ pathname }: { readonly pathname: string }) {
  const { state, isMobile } = useSidebar();
  return (
    <div className='flex flex-1 flex-col gap-4 overflow-y-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
      <nav aria-label='OV Navigation' className='flex flex-col gap-4'>
        {OPERATOR_NAV_SECTIONS.map(section => (
          <OperatorNavGroup
            key={section.id}
            section={section}
            pathname={pathname}
          />
        ))}
      </nav>
      {/* Dynamic list hrefs stay outside the canonical OV landmark so the
          registry link set remains exact. */}
      <div hidden={state === 'closed' && !isMobile}>
        <OperatorListsNav pathname={pathname} />
      </div>
    </div>
  );
}

/** Logo (clean header) or back button for settings/library */
function SidebarHeaderNav({
  headerOwnsCollapsedToggle,
  isRouteSidebar,
  isOperatorSection,
  canSwitchWorkspaces,
  hasMultipleIdentities,
  isDemoRoute,
  variant = 'jovie',
  routeBackHref = APP_ROUTES.DASHBOARD,
  routeBackLabel = 'Back to App',
}: Readonly<{
  headerOwnsCollapsedToggle: boolean;
  isRouteSidebar: boolean;
  isOperatorSection: boolean;
  canSwitchWorkspaces: boolean;
  hasMultipleIdentities: boolean;
  isDemoRoute: boolean;
  variant?: BrandVariant;
  routeBackHref?: string;
  routeBackLabel?: string;
}>) {
  const isDesktop = useIsElectronRuntime();
  const { state, isMobile, isPreview, open: pinned } = useSidebar();
  const chromeHidden = state === 'closed' && !isMobile;
  const { inboxNavigation, selectedProfile } = useDashboardData();

  return (
    <div className='flex w-full items-center' data-sidebar-brand-row='true'>
      {/* Keep the canonical brand painted; only its labels and secondary
          actions stage out. The icon and toggle both fit the 52px rail. */}
      <div className='min-w-0 flex-1'>
        {(() => {
          if (isRouteSidebar) {
            return (
              <div className='flex w-full items-center gap-2'>
                <Link
                  href={routeBackHref}
                  prefetch={false}
                  aria-label={routeBackLabel}
                  className={cn(
                    'focus-ring-themed inline-flex h-6 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-sidebar-item-foreground transition-[background,border-color,color] duration-normal ease-interactive hover:bg-sidebar-accent/55 hover:text-sidebar-item-foreground focus-visible:bg-sidebar-accent/55 focus-visible:text-sidebar-item-foreground [font-weight:var(--font-weight-nav)]',
                    'group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
                  )}
                >
                  <ArrowLeft
                    className='size-3.5 text-sidebar-item-icon'
                    aria-hidden='true'
                  />
                  <span className={cn('truncate', SHELL_RAIL_LABEL)}>
                    {routeBackLabel}
                  </span>
                </Link>
              </div>
            );
          }
          if (isDemoRoute) {
            return (
              <div
                className={cn(
                  'flex h-7 w-full items-center gap-(--app-shell-sidebar-icon-gap) rounded-full',
                  'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
                )}
              >
                <BrandLogo
                  size='chrome'
                  tone='auto'
                  rounded={false}
                  className='rounded-sm shrink-0'
                />
                <span
                  className={cn(
                    'truncate flex-1 text-left text-app tracking-tight text-sidebar-item-foreground [font-weight:var(--font-weight-nav)]',
                    SHELL_RAIL_LABEL
                  )}
                >
                  {selectedProfile?.displayName ?? 'Demo'}
                </span>
              </div>
            );
          }
          if (canSwitchWorkspaces) {
            return (
              <WorkspaceSelector
                currentWorkspaceId={variant === 'ov' ? 'ov' : 'customer'}
                workspaces={APP_SHELL_WORKSPACES}
              />
            );
          }
          if (hasMultipleIdentities && !isOperatorSection) {
            return <IdentitySwitcher />;
          }
          // Clean header: the Jovie mark is the global "Ask Jovie" entry point
          // (JOV-6569). OV skin keeps its static identity wordmark; user menu
          // lives in the bottom Settings button.
          return (
            <div
              className={cn(
                'flex h-7 w-full items-center gap-(--app-shell-sidebar-icon-gap)',
                'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
              )}
            >
              {variant === 'ov' ? (
                <>
                  <BrandLogo
                    size='compact'
                    tone='auto'
                    variant={variant}
                    rounded={false}
                    className='rounded-sm shrink-0'
                  />
                  <span className={cn('truncate', SHELL_RAIL_LABEL)}>
                    {BRAND_WORDMARKS[variant]}
                  </span>
                </>
              ) : (
                <AskJovieMark variant={variant} />
              )}
            </div>
          );
        })()}
      </div>
      {!isRouteSidebar && !isOperatorSection && !isDemoRoute ? (
        <RailStagedContent
          hidden={chromeHidden}
          className='flex items-center'
          data-sidebar-header-actions='true'
        >
          <SidebarInboxLink availability={inboxNavigation} />
          <HeaderSearchSurfaceFromContext compact />
        </RailStagedContent>
      ) : null}

      {!isDesktop ? (
        <RailStagedContent
          hidden={
            !pinned && !isPreview && !isMobile && headerOwnsCollapsedToggle
          }
          stage={headerOwnsCollapsedToggle}
          className='ml-auto shrink-0 group-data-[collapsible=icon]:order-first group-data-[collapsible=icon]:mx-auto'
        >
          <SidebarCollapseButton />
        </RailStagedContent>
      ) : null}
    </div>
  );
}

/**
 * UnifiedSidebar - Single sidebar component for all post-auth sections
 *
 * Header shows workspace identity, navigation owns attention and update state,
 * and one footer identity group owns creator identity and Public Profile access.
 */
export function UnifiedSidebar({
  section,
  variant = 'jovie',
  headerOwnsCollapsedToggle = false,
}: UnifiedSidebarProps) {
  const {
    identities,
    isAdmin: canSwitchWorkspaces,
    user,
    profileCompletion,
    selectedProfile: dockProfile,
  } = useDashboardData();
  const sidebarOverride = useShellSidebarOverride();
  const { state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const isDemoRoute = isDemoRoutePath(pathname);
  const isInSettings = section === 'settings';
  const isOperatorSection = section === 'admin' || section === 'ov';
  const isRouteSidebar = isInSettings || sidebarOverride !== null;
  const hasMultipleIdentities = identities.length >= 2;

  const { profileHref } = useProfileData(section !== 'ov');
  const isSidebarCollapsed = sidebarState === 'closed';
  // JOV-8137: the completion widget persists on every page's sidebar until
  // the profile hits 100%, then disappears. Missing data reads as complete.
  const showProfileCompletionWidget =
    !isOperatorSection &&
    !isRouteSidebar &&
    !isDemoRoute &&
    (profileCompletion?.percentage ?? 100) < 100;

  return (
    <Sidebar
      variant='sidebar'
      data-shell-rail-motion='left'
      collapsible='icon'
      className={cn(
        'bg-base',
        '[--sidebar-width:var(--app-shell-sidebar-width)]',
        // The left rail owns its internal label/icon staging while
        // AppShellFrame owns the adjacent main-plane allocation (#4522).
        SHELL_RAIL_ALLOCATION,
        // OV brand skin: class-based token override, same mechanism as `.dark`
        // (see design-system.css → OV MODE). Zero layout impact.
        variant === 'ov' && 'ov-mode'
      )}
    >
      <SidebarHeader
        data-electron-drag-region='true'
        className={cn(
          'relative justify-center gap-0 px-(--app-shell-sidebar-inset) group-data-[collapsible=icon]:px-0',
          isRouteSidebar || isOperatorSection
            ? 'h-(--app-shell-header-height) py-0.5'
            : 'h-16 pt-5 pb-4'
        )}
      >
        <SidebarHeaderNav
          headerOwnsCollapsedToggle={headerOwnsCollapsedToggle}
          isRouteSidebar={isRouteSidebar}
          isOperatorSection={isOperatorSection}
          canSwitchWorkspaces={canSwitchWorkspaces}
          hasMultipleIdentities={hasMultipleIdentities}
          isDemoRoute={isDemoRoute}
          variant={variant}
          routeBackHref={sidebarOverride?.backHref}
          routeBackLabel={sidebarOverride?.backLabel}
        />
      </SidebarHeader>

      <SidebarContent className='min-h-0 flex-1 overflow-anchor-none px-0 pb-(--space-2-5) pt-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <SidebarGroup className='flex min-h-0 flex-1 flex-col pb-1'>
          <SidebarGroupContent className='flex min-h-0 flex-1 flex-col'>
            {section === 'ov' ? (
              <OperatorNavigation pathname={pathname} />
            ) : isInSettings ? (
              <div className='flex flex-1 flex-col overflow-y-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
                <SettingsNavigation pathname={pathname} section={section} />
              </div>
            ) : sidebarOverride ? (
              sidebarOverride.content
            ) : (
              <DashboardNav
                headerOwnsInbox={!isDemoRoute && !isOperatorSection}
              >
                {isDemoRoute ? (
                  <HeaderSearchSurfaceFromContext className='w-full max-w-none sm:w-full lg:w-full' />
                ) : null}
              </DashboardNav>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
        {/* JOV-8137: the completion widget persists on every page's sidebar
            until the profile hits 100% — it hides itself once complete. */}
        {showProfileCompletionWidget ? (
          <div
            className='group-data-[collapsible=icon]:hidden px-(--app-shell-sidebar-inset)'
            data-testid='sidebar-profile-completion'
          >
            <ProfileCompletionCard />
          </div>
        ) : null}
      </SidebarContent>

      <SidebarFooter className='mt-auto gap-0 border-t border-subtle px-0 pt-(--space-2-5) pb-(--space-3-5) [&_[data-slot=common-dropdown-trigger]]:min-h-8'>
        <SidebarDockBridge
          userId={user?.id ?? ''}
          userState={{ hasClaimedHandle: Boolean(dockProfile?.username) }}
          collapsed={isSidebarCollapsed}
        >
          {dockStatus => (
            <SidebarIdentityGroup
              calm={!isRouteSidebar}
              profileHref={section === 'ov' ? undefined : profileHref}
              dockStatus={dockStatus}
              label={section === 'ov' ? 'Account' : undefined}
            />
          )}
        </SidebarDockBridge>
      </SidebarFooter>
    </Sidebar>
  );
}
