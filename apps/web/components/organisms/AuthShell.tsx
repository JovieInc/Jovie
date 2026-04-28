'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { useRightPanel } from '@/contexts/RightPanelContext';
import { DashboardHeader } from '@/features/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/features/dashboard/organisms/DashboardMobileTabs';
import { MobileProfileDrawer } from '@/features/dashboard/organisms/MobileProfileDrawer';
import { useAppFlag } from '@/lib/flags/client';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';
import { AppShellFrame } from './AppShellFrame';
import { PersistentAudioBar } from './PersistentAudioBar';

// Module-scope singleton — stable identity prevents AppShellFrame memo from
// breaking on breadcrumb/header changes. PersistentAudioBar uses hooks
// internally for its own state updates.
const AUDIO_PLAYER = <PersistentAudioBar />;

export interface AuthShellProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
  readonly breadcrumbs: DashboardBreadcrumbItem[];
  readonly headerBadge?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly showMobileTabs?: boolean;
  readonly isTableRoute?: boolean;
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
  children,
}: Readonly<Omit<AuthShellProps, 'children'> & { children: ReactNode }>) {
  const { isMobile } = useSidebar();
  const rightPanel = useRightPanel();
  const previewPanelState = usePreviewPanelState();
  const shellChatV1Enabled = useAppFlag('SHELL_CHAT_V1');

  const sidebarTrigger = isMobile ? null : <SidebarTrigger />;

  const isInSettings = section === 'settings';

  // Memoize the sidebar so it doesn't re-render on breadcrumb/header changes.
  // The sidebar only depends on `section` — it shouldn't remount when
  // navigating between pages within the same section.
  const sidebar = useMemo(
    () => <UnifiedSidebar section={section} />,
    [section]
  );

  // Memoize mobile bottom nav — stable across route changes
  const mobileBottomNav = useMemo(
    () => (showMobileTabs ? <DashboardMobileTabs /> : null),
    [showMobileTabs]
  );

  return (
    <AppShellFrame
      sidebar={sidebar}
      header={
        isInSettings ? null : (
          <DashboardHeader
            breadcrumbs={breadcrumbs}
            sidebarTrigger={sidebarTrigger}
            breadcrumbSuffix={headerBadge}
            action={headerAction}
            mobileProfileSlot={
              <MobileProfileDrawer onOpen={previewPanelState.toggle} />
            }
            showDivider={isTableRoute}
          />
        )
      }
      main={children}
      rightPanel={rightPanel}
      audioPlayer={AUDIO_PLAYER}
      mobileBottomNav={mobileBottomNav}
      contentClassName={getContentClassName(showMobileTabs, isTableRoute)}
      isTableRoute={isTableRoute}
      variant={shellChatV1Enabled ? 'shellChatV1' : 'legacy'}
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
