import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ComponentProps, ReactElement } from 'react';
import React from 'react';
import { vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardNav } from '@/features/dashboard/dashboard-nav';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS, type AppFlagSnapshot } from '@/lib/flags/contracts';

export const mockUsePathname = vi.fn<() => string>(() => APP_ROUTES.CHAT);
export const mockUseTaskStatsQuery = vi.fn(() => ({ data: undefined }));
export const mockUsePlanGate = vi.fn(() => ({
  canAccessTasksWorkspace: true,
  isLoading: false,
}));
export const mockToastInfo = vi.fn();
export const mockShowPendingShell = vi.fn();
export const mockClearPendingShell = vi.fn();
export const mockRouterPush = vi.fn();
export const mockOpenPreviewPanel = vi.fn();
export const mockTogglePreviewPanel = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useParams: () => ({}),
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

vi.mock('@statsig/react-bindings', () => ({
  useFeatureGate: () => ({ value: true }),
  StatsigContext: React.createContext({ client: {} }),
}));

vi.mock('@/lib/queries/useChatConversationsQuery', () => ({
  useChatConversationsQuery: () => ({ data: undefined }),
}));

vi.mock('@/lib/queries/useChatMutations', () => ({
  useDeleteConversationMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    isOpen: false,
    open: (...args: unknown[]) => mockOpenPreviewPanel(...args),
    close: vi.fn(),
    toggle: (...args: unknown[]) => mockTogglePreviewPanel(...args),
  }),
  usePreviewPanelData: () => ({
    data: null,
  }),
  usePreviewPanel: () => ({
    isOpen: false,
    activeTab: null,
    data: null,
    open: (...args: unknown[]) => mockOpenPreviewPanel(...args),
    close: vi.fn(),
    toggle: (...args: unknown[]) => mockTogglePreviewPanel(...args),
  }),
}));

vi.mock('@/components/organisms/PendingShellContext', () => ({
  usePendingShell: () => ({
    clearPendingShell: (...args: unknown[]) => mockClearPendingShell(...args),
    pendingShellRoute: null,
    showPendingShell: (...args: unknown[]) => mockShowPendingShell(...args),
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/lib/queries/useTasksQuery', () => ({
  useTaskStatsQuery: (...args: unknown[]) => mockUseTaskStatsQuery(...args),
}));

vi.mock('@/lib/queries', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');

  return {
    ...actual,
    usePlanGate: (...args: unknown[]) => mockUsePlanGate(...args),
  };
});

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');

  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
    TooltipTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
    TooltipContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
    TooltipProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
  };
});

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};

type RenderDashboardNavFn = (ui: ReactElement) => ReturnType<typeof render>;

export function resetDashboardNavTestMocks() {
  mockUsePathname.mockReset();
  mockUsePathname.mockReturnValue(APP_ROUTES.CHAT);
  mockUseTaskStatsQuery.mockReset();
  mockUseTaskStatsQuery.mockReturnValue({ data: undefined });
  mockUsePlanGate.mockReset();
  mockUsePlanGate.mockReturnValue({
    canAccessTasksWorkspace: true,
    isLoading: false,
  });
  mockToastInfo.mockReset();
  mockShowPendingShell.mockReset();
  mockClearPendingShell.mockReset();
  mockRouterPush.mockReset();
  mockOpenPreviewPanel.mockReset();
  mockTogglePreviewPanel.mockReset();
}

export function renderDashboardNav({
  renderFn = render,
  overrides = {},
  sidebarProps = {},
  appFlags = {},
}: Readonly<{
  renderFn?: RenderDashboardNavFn;
  overrides?: Partial<DashboardData>;
  sidebarProps?: ComponentProps<typeof SidebarProvider>;
  appFlags?: Partial<AppFlagSnapshot>;
}>) {
  const value: DashboardData = { ...baseDashboardData, ...overrides };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderFn(
    <QueryClientProvider client={queryClient}>
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, ...appFlags }}>
        <DashboardDataProvider value={value}>
          <SidebarProvider {...sidebarProps}>
            <DashboardNav />
          </SidebarProvider>
        </DashboardDataProvider>
      </AppFlagProvider>
    </QueryClientProvider>
  );
}
