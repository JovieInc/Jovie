'use client';

import type { ReactNode } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/components/dashboard/organisms/DashboardMobileTabs';
import { MobileProfileDrawer } from '@/components/dashboard/organisms/MobileProfileDrawer';
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { useRightPanel } from '@/contexts/RightPanelContext';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';
import { AppShellFrame } from './AppShellFrame';

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

function AuthShellInner({
  section,
  breadcrumbs,
  headerBadge,
  headerAction,
  showMobileTabs = false,
  isTableRoute = false,
  children,
}: Readonly<Omit<AuthShellProps, 'children'> & { children: ReactNode }>) {
  const { isMobile, state } = useSidebar();
  const rightPanel = useRightPanel();
  const previewPanelState = usePreviewPanelState();

  const sidebarTrigger =
    !isMobile && state === 'closed' ? <SidebarTrigger /> : null;

  const isInSettings = section === 'settings';

  return (
    <AppShellFrame
      sidebar={<UnifiedSidebar section={section} />}
      header={
        !isInSettings ? (
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
        ) : null
      }
      main={children}
      rightPanel={rightPanel}
      mobileBottomNav={showMobileTabs ? <DashboardMobileTabs /> : null}
      contentClassName={
        showMobileTabs
          ? isTableRoute
            ? 'pb-20 lg:pb-0'
            : 'pb-20 lg:pb-6'
          : undefined
      }
      isTableRoute={isTableRoute}
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
