import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const {
  mockCaptureError,
  mockFetchQuery,
  mockGetCachedAuth,
  mockGetCurrentUserEntitlements,
  mockGetDashboardShellData,
  mockGetDehydratedState,
  mockGetQueryClient,
  mockGetTaskBoard,
  mockGetTasks,
  mockRedirect,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockFetchQuery: vi.fn(),
  mockGetCachedAuth: vi.fn(),
  mockGetCurrentUserEntitlements: vi.fn(),
  mockGetDashboardShellData: vi.fn(),
  mockGetDehydratedState: vi.fn(),
  mockGetQueryClient: vi.fn(),
  mockGetTaskBoard: vi.fn(),
  mockGetTasks: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardShellData: mockGetDashboardShellData,
}));

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  getTaskBoard: mockGetTaskBoard,
  getTasks: mockGetTasks,
}));

vi.mock('@/lib/queries/server', () => ({
  getDehydratedState: mockGetDehydratedState,
  getQueryClient: mockGetQueryClient,
}));

vi.mock('@/lib/queries/HydrateClient', () => ({
  HydrateClient: ({
    children,
  }: {
    readonly children: ReactNode;
    readonly state?: unknown;
  }) => <div data-testid='hydrate-client'>{children}</div>,
}));

vi.mock('@/components/features/dashboard/tasks/TasksPageClient', () => ({
  TasksPageClient: () => (
    <div data-testid='tasks-page-client'>Tasks Client</div>
  ),
}));

vi.mock(
  '@/components/features/dashboard/tasks/TasksUpgradeInterstitial',
  () => ({
    TasksWorkspaceUpgradeInterstitial: () => (
      <div data-testid='tasks-upgrade-interstitial'>Tasks Upgrade</div>
    ),
  })
);

import LegacyTasksPage from '@/app/app/(shell)/dashboard/tasks/page';
import TasksPage from '@/app/app/(shell)/tasks/page';

describe('tasks page routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetCurrentUserEntitlements.mockResolvedValue({
      canAccessTasksWorkspace: true,
    });
    mockGetDashboardShellData.mockResolvedValue({
      dashboardLoadError: null,
      needsOnboarding: false,
      selectedProfile: {
        id: 'profile-1',
      },
    });
    mockGetDehydratedState.mockReturnValue({ queries: [] });
    mockGetQueryClient.mockReturnValue({
      fetchQuery: mockFetchQuery,
    });
    mockFetchQuery.mockImplementation(
      async ({ queryFn }: { readonly queryFn: () => Promise<unknown> }) =>
        queryFn()
    );
    mockGetTasks.mockResolvedValue({ nextCursor: null, tasks: [] });
    mockGetTaskBoard.mockResolvedValue({ columns: [], totalCount: 0 });
  });

  it('redirects signed-out users to sign-in with the canonical route as the return target', async () => {
    mockGetCachedAuth.mockResolvedValueOnce({ userId: null });
    const encodedReturnPath = encodeURIComponent(APP_ROUTES.TASKS);

    await expect(TasksPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      `${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );
  });

  it('renders the upgrade interstitial for users without task access', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      canAccessTasksWorkspace: false,
    });

    render(await TasksPage());

    expect(
      screen.getByTestId('tasks-upgrade-interstitial')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-page-client')).not.toBeInTheDocument();
    expect(mockFetchQuery).not.toHaveBeenCalled();
  });

  it('server-prefetches default task data before rendering the workspace', async () => {
    render(await TasksPage());

    expect(mockFetchQuery).toHaveBeenCalledTimes(2);
    expect(mockGetTasks).toHaveBeenCalledWith({ limit: 100 });
    expect(mockGetTaskBoard).toHaveBeenCalledWith({ limit: 100 });
    expect(screen.getByTestId('hydrate-client')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-page-client')).toBeInTheDocument();
    expect(
      screen.queryByTestId('tasks-upgrade-interstitial')
    ).not.toBeInTheDocument();
  });

  it('redirects the legacy dashboard entry point to the canonical /app/tasks route', () => {
    expect(() => LegacyTasksPage()).toThrow(`REDIRECT:${APP_ROUTES.TASKS}`);

    expect(mockRedirect).toHaveBeenCalledWith(APP_ROUTES.TASKS);
  });

  it('redirects onboarding-required users back to start', async () => {
    mockGetDashboardShellData.mockResolvedValueOnce({
      dashboardLoadError: null,
      needsOnboarding: true,
      selectedProfile: null,
    });

    await expect(TasksPage()).rejects.toThrow(`REDIRECT:${APP_ROUTES.START}`);

    expect(mockRedirect).toHaveBeenCalledWith(APP_ROUTES.START);
  });
});
