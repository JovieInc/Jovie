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
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

const DEFAULT_PLAN_GATE = {
  isLoading: false,
  isError: false,
  isPro: true,
  plan: 'pro',
  ...ENTITLEMENT_REGISTRY.pro.booleans,
  ...ENTITLEMENT_REGISTRY.pro.limits,
};

export const mockUsePathname = vi.fn<() => string>(() => APP_ROUTES.CHAT);
export const mockUseTaskStatsQuery = vi.fn(() => ({ data: undefined }));
export const mockUsePlanGate = vi.fn(() => ({ ...DEFAULT_PLAN_GATE }));
export const mockToastInfo = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
  usePreviewPanelData: () => ({
    data: null,
  }),
  usePreviewPanel: () => ({
    isOpen: false,
    activeTab: null,
    data: null,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
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
  mockUsePlanGate.mockReturnValue({ ...DEFAULT_PLAN_GATE });
  mockToastInfo.mockReset();
}

export function renderDashboardNav({
  renderFn = render,
  overrides = {},
  sidebarProps = {},
}: Readonly<{
  renderFn?: RenderDashboardNavFn;
  overrides?: Partial<DashboardData>;
  sidebarProps?: ComponentProps<typeof SidebarProvider>;
}>) {
  const value: DashboardData = { ...baseDashboardData, ...overrides };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderFn(
    <QueryClientProvider client={queryClient}>
      <DashboardDataProvider value={value}>
        <SidebarProvider {...sidebarProps}>
          <DashboardNav />
        </SidebarProvider>
      </DashboardDataProvider>
    </QueryClientProvider>
  );
}
