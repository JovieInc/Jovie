import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton';
import { SidebarProvider, useSidebar } from '@/components/organisms/sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { APP_ROUTES } from '@/constants/routes';
import {
  ShellSidebarOverrideProvider,
  useRegisterShellSidebarOverride,
} from '@/contexts/ShellSidebarOverrideContext';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { resetDashboardNavTestMocks } from '@/tests/utils/dashboard-nav-test-support';
import {
  electronRuntimeMock,
  nowPlayingBridgePropsMock,
  signOutMock,
  unifiedPathnameMock,
  userButtonPropsMock,
} from './UnifiedSidebar.mock-factories';
import { dashboardData } from './unified-sidebar-dashboard-data';

export {
  electronRuntimeMock,
  nowPlayingBridgePropsMock,
  signOutMock,
  unifiedPathnameMock,
  userButtonPropsMock,
};

export function resetUnifiedSidebarTestState() {
  document.cookie = 'sidebar:state=; path=/; max-age=0';
  electronRuntimeMock.isElectronRuntime = true;
  document.documentElement.removeAttribute('data-desktop-runtime');
  signOutMock.mockReset();
  userButtonPropsMock.mockReset();
  nowPlayingBridgePropsMock.mockReset();
  resetDashboardNavTestMocks();
  unifiedPathnameMock.mockReset();
  unifiedPathnameMock.mockReturnValue(APP_ROUTES.CHAT);
}

function LibrarySidebarOverride({
  children,
}: {
  readonly children: ReactNode;
}) {
  useRegisterShellSidebarOverride({
    key: 'library',
    backHref: APP_ROUTES.CHAT,
    backLabel: 'Back to App',
    content: (
      <nav aria-label='Library filters'>
        <button type='button'>Status</button>
        {children}
      </nav>
    ),
  });

  return null;
}

function BrowserHeaderToggle() {
  const { state } = useSidebar();
  return !electronRuntimeMock.isElectronRuntime && state === 'closed' ? (
    <SidebarCollapseButton />
  ) : null;
}

export function renderUnifiedSidebar({
  overrideContent,
  pathname = APP_ROUTES.LIBRARY,
  section = 'library',
  isAdmin = false,
  variant,
  data,
  sidebarDefaultOpen = true,
}: {
  readonly overrideContent?: ReactNode;
  readonly pathname?: string;
  readonly section?: 'admin' | 'dashboard' | 'library' | 'ov' | 'settings';
  readonly isAdmin?: boolean;
  readonly variant?: 'jovie' | 'ov';
  readonly data?: Partial<DashboardData>;
  readonly sidebarDefaultOpen?: boolean;
} = {}) {
  unifiedPathnameMock.mockReturnValue(pathname);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <DashboardDataProvider value={{ ...dashboardData, isAdmin, ...data }}>
          <TooltipProvider>
            <SidebarProvider defaultOpen={sidebarDefaultOpen}>
              <ShellSidebarOverrideProvider>
                {overrideContent ? (
                  <LibrarySidebarOverride>
                    {overrideContent}
                  </LibrarySidebarOverride>
                ) : null}
                <UnifiedSidebar
                  section={section}
                  variant={variant}
                  headerOwnsCollapsedToggle
                />
                <BrowserHeaderToggle />
              </ShellSidebarOverrideProvider>
            </SidebarProvider>
          </TooltipProvider>
        </DashboardDataProvider>
      </AppFlagProvider>
    </QueryClientProvider>
  );
}
