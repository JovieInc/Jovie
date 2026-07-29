'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { useComposerFocus } from '@/components/features/chat/Composer';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton';
import { SidebarProvider, useSidebar } from '@/components/organisms/Sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import { useOptionalHeaderActions } from '@/contexts/HeaderActionsContext';
import { useRightPanel } from '@/contexts/RightPanelContext';
import { DashboardHeader } from '@/features/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/features/dashboard/organisms/DashboardMobileTabs';
import { MobileProfileDrawer } from '@/features/dashboard/organisms/MobileProfileDrawer';
import type { AppShellSection } from '@/types/app-shell';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';
import { AppShellFrame } from './AppShellFrame';
import { OperatorMobileNavigation } from './OperatorMobileNavigation';
import { PersistentAudioBar } from './PersistentAudioBar';
export interface AuthShellProps {
  readonly section: AppShellSection;
  readonly breadcrumbs: DashboardBreadcrumbItem[];
  readonly headerBadge?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly showMobileTabs?: boolean;
  readonly isTableRoute?: boolean;
  readonly isLyricsRoute?: boolean;
  /**
   * Chat routes lift the ambient gradient to the shell frame and render the
   * header with a transparent fill so the wash is full-bleed to the top of
   * the content panel (#13386).
   */
  readonly isChatRoute?: boolean;
  readonly onSidebarOpenChange?: (open: boolean) => void;
  readonly sidebarDefaultOpen?: boolean;
  readonly children: ReactNode;
}

function getContentClassName(showMobileTabs: boolean, isTableRoute: boolean) {
  if (!showMobileTabs) return undefined;
  return isTableRoute ? 'pb-20 lg:pb-0' : 'pb-20 lg:pb-6';
}

function AuthShellInner({
  section,
  breadcrumbs,
  headerBadge,
  headerAction,
  showMobileTabs = false,
  isTableRoute = false,
  isLyricsRoute = false,
  isChatRoute = false,
  children,
}: Readonly<Omit<AuthShellProps, 'children'> & { children: ReactNode }>) {
  const { isMobile, state: sidebarState } = useSidebar();
  const { isComposerFocused } = useComposerFocus();
  const rightPanel = useRightPanel();
  const previewPanelState = usePreviewPanelState();
  const headerActionsState = useOptionalHeaderActions();
  const sidebarTrigger = isMobile ? null : sidebarState === 'closed' ? (
    <SidebarCollapseButton />
  ) : null;

  const isInSettings = section === 'settings';
  const hideTopHeader = isInSettings || isLyricsRoute;
  const showCustomerMobileTabs =
    showMobileTabs && section !== 'ov' && section !== 'admin';
  const hasMobileBottomNav = section === 'ov' || showCustomerMobileTabs;

  // Memoize the sidebar so it doesn't re-render on breadcrumb/header changes.
  // The sidebar only depends on `section` — it shouldn't remount when
  // navigating between pages within the same section.
  const sidebar = useMemo(
    () => (
      <UnifiedSidebar
        section={section}
        variant={section === 'ov' ? 'ov' : 'jovie'}
      />
    ),
    [section]
  );

  // Memoize mobile bottom nav — stable across route changes
  const mobileBottomNav = useMemo(
    () =>
      section === 'ov' ? (
        <OperatorMobileNavigation />
      ) : showCustomerMobileTabs ? (
        <DashboardMobileTabs />
      ) : null,
    [section, showCustomerMobileTabs]
  );
  const searchSurface = useMemo(() => {
    return headerActionsState ? (
      <HeaderSearchSurfaceFromContext className='w-full sm:w-55 lg:w-65' />
    ) : null;
  }, [headerActionsState]);
  const audioPlayer = useMemo(() => <PersistentAudioBar />, []);

  return (
    <AppShellFrame
      sidebar={sidebar}
      header={
        hideTopHeader ? null : (
          <DashboardHeader
            breadcrumbs={breadcrumbs}
            sidebarTrigger={sidebarTrigger}
            breadcrumbSuffix={headerBadge}
            action={headerAction}
            searchSurface={searchSurface}
            isSearchActive={headerActionsState?.isSearchOpen ?? false}
            mobileProfileSlot={
              section === 'ov' || section === 'admin' ? null : (
                <MobileProfileDrawer onOpen={previewPanelState.toggle} />
              )
            }
            showDivider={isTableRoute}
            transparent={isChatRoute}
          />
        )
      }
      chatAmbientGradient={isChatRoute}
      main={children}
      rightPanel={rightPanel}
      audioPlayer={audioPlayer}
      mobileBottomNav={mobileBottomNav}
      contentClassName={getContentClassName(hasMobileBottomNav, isTableRoute)}
      composerFocusActive={isComposerFocused && !isMobile}
    />
  );
}

export function AuthShell(props: Readonly<AuthShellProps>) {
  const { onSidebarOpenChange, sidebarDefaultOpen, ...rest } = props;

  return (
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen}
      onOpenChange={onSidebarOpenChange}
    >
      <AuthShellInner {...rest} />
    </SidebarProvider>
  );
}
