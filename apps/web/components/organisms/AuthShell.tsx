'use client';

// @coverage-via apps/web/tests/unit/components/organisms/AuthShell.flag.test.tsx

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { useComposerFocus } from '@/components/features/chat/Composer';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton';
import { MediaCanvasHost } from '@/components/organisms/media-canvas/MediaCanvasHost';
import { SidebarProvider, useSidebar } from '@/components/organisms/sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { RuntimeUpdateProvider } from '@/components/shell/RuntimeUpdateProvider';
import { useRightPanel } from '@/contexts/RightPanelContext';
import { DashboardHeader } from '@/features/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/features/dashboard/organisms/DashboardMobileTabs';
import { MobileProfileDrawer } from '@/features/dashboard/organisms/MobileProfileDrawer';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { env } from '@/lib/env-client';
import type { AppShellSection } from '@/types/app-shell';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';
import { AppShellFrame } from './AppShellFrame';
import { OperatorMobileNavigation } from './OperatorMobileNavigation';
import { PersistentAudioBar } from './PersistentAudioBar';
import { WhatsNewBanner } from './whats-new/WhatsNewBanner';
export interface AuthShellProps {
  readonly section: AppShellSection;
  readonly breadcrumbs: DashboardBreadcrumbItem[];
  readonly headerBadge?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly railToggle?: ReactNode;
  readonly commandPaletteHeader?: ReactNode;
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

/** Mac app everywhere; on the web only the operator shell (dogfood). */
export function isWhatsNewBannerEnabled({
  section,
  isElectron,
  isAutomatedTest,
}: {
  readonly section: AppShellSection;
  readonly isElectron: boolean;
  readonly isAutomatedTest: boolean;
}): boolean {
  return !isAutomatedTest && (isElectron || section === 'ov');
}

function getContentClassName(showMobileTabs: boolean, isTableRoute: boolean) {
  if (!showMobileTabs) return undefined;
  return isTableRoute ? undefined : 'lg:pb-6';
}

function AuthShellInner({
  section,
  breadcrumbs,
  headerBadge,
  headerAction,
  railToggle,
  commandPaletteHeader,
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
  const isElectron = useIsElectronRuntime();
  const showWhatsNew = isWhatsNewBannerEnabled({
    section,
    isElectron,
    isAutomatedTest: env.IS_TEST || env.IS_E2E,
  });
  // The desktop window-control row (DesktopTitlebar) owns the single canonical
  // left-sidebar toggle in Electron. Keep the initial client tree identical to
  // SSR; the runtime CSS hides the header slot before paint, and this hook
  // removes it after hydration without replacing the shell or losing drafts.
  const sidebarTrigger =
    isMobile || isElectron ? null : sidebarState === 'closed' ? (
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
  const audioPlayer = useMemo(() => <PersistentAudioBar />, []);

  return (
    <RuntimeUpdateProvider>
      <AppShellFrame
        sidebar={sidebar}
        header={
          hideTopHeader ? null : (
            <DashboardHeader
              breadcrumbs={breadcrumbs}
              sidebarTrigger={sidebarTrigger}
              railToggle={railToggle}
              breadcrumbSuffix={headerBadge}
              action={headerAction}
              commandPaletteHeader={commandPaletteHeader}
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
      <MediaCanvasHost />
      <WhatsNewBanner enabled={showWhatsNew} />
    </RuntimeUpdateProvider>
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
