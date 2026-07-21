import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from './dashboard/actions';

const {
  captureErrorMock,
  getAppFlagValueMock,
  getCachedAuthMock,
  getDashboardShellDataMock,
  notFoundMock,
  redirectMock,
} = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
  getCachedAuthMock: vi.fn(),
  getDashboardShellDataMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: ({ message }: { readonly message: string }) => (
    <div data-testid='page-error'>{message}</div>
  ),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: getCachedAuthMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('./dashboard/actions', () => ({
  getDashboardShellData: getDashboardShellDataMock,
}));

import {
  loadAppShellRouteContext,
  loadAuthenticatedAppShellUserId,
  requireAppShellDashboardUserId,
} from './app-shell-route-context';

function shellData(
  overrides: Partial<{
    readonly dashboardLoadError: unknown;
    readonly needsOnboarding: boolean;
    readonly selectedProfile: { readonly id: string } | null;
    readonly user: { readonly id: string } | null;
  }> = {}
): DashboardData {
  return {
    dashboardLoadError: undefined,
    needsOnboarding: false,
    selectedProfile: { id: 'profile_1' },
    user: { id: 'dashboard_user_1' },
    ...overrides,
  } as unknown as DashboardData;
}

describe('loadAppShellRouteContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedAuthMock.mockResolvedValue({ userId: 'user_1' });
    getAppFlagValueMock.mockResolvedValue(true);
    getDashboardShellDataMock.mockResolvedValue(shellData());
  });

  it('redirects unauthenticated app shell routes to signin by default', async () => {
    getCachedAuthMock.mockResolvedValue({ userId: null });

    await expect(
      loadAppShellRouteContext({
        route: '/app/releases',
        dashboardErrorMessage: 'Failed to load releases data.',
      })
    ).rejects.toThrow('NEXT_REDIRECT:/signin?redirect_url=%2Fapp%2Freleases');

    expect(getDashboardShellDataMock).not.toHaveBeenCalled();
  });

  it('centralizes early auth redirects for routes that stream after auth', async () => {
    getCachedAuthMock.mockResolvedValue({ userId: null });

    await expect(
      loadAuthenticatedAppShellUserId({ route: '/app/audience' })
    ).rejects.toThrow('NEXT_REDIRECT:/signin?redirect_url=%2Fapp%2Faudience');

    expect(getDashboardShellDataMock).not.toHaveBeenCalled();
  });

  it('returns early authenticated user ids without loading shell data', async () => {
    getCachedAuthMock.mockResolvedValue({ userId: 'user_early' });

    await expect(
      loadAuthenticatedAppShellUserId({ route: '/app/audience' })
    ).resolves.toBe('user_early');

    expect(getDashboardShellDataMock).not.toHaveBeenCalled();
  });

  it('returns the dashboard database user id from shared route context', () => {
    const dashboardData = shellData({
      user: { id: 'dashboard_user_2' },
    });

    expect(
      requireAppShellDashboardUserId(
        {
          ok: true,
          userId: 'clerk_user_1',
          dashboardData,
          profileId: 'profile_1',
        },
        '/app/audience'
      )
    ).toBe('dashboard_user_2');
  });

  it('centralizes missing dashboard user signin redirects', () => {
    const dashboardData = shellData({ user: null });

    expect(() =>
      requireAppShellDashboardUserId(
        {
          ok: true,
          userId: 'clerk_user_1',
          dashboardData,
          profileId: 'profile_1',
        },
        '/app/audience'
      )
    ).toThrow('NEXT_REDIRECT:/signin?redirect_url=%2Fapp%2Faudience');
  });

  it('preserves route search params in shared signin redirects', async () => {
    getCachedAuthMock.mockResolvedValue({ userId: null });

    await expect(
      loadAppShellRouteContext({
        route: '/app/audience?view=list',
        dashboardErrorMessage: 'Failed to load audience data.',
      })
    ).rejects.toThrow(
      'NEXT_REDIRECT:/signin?redirect_url=%2Fapp%2Faudience%3Fview%3Dlist'
    );
  });

  it('uses notFound for gated routes that should not expose auth state', async () => {
    getCachedAuthMock.mockResolvedValue({ userId: null });

    await expect(
      loadAppShellRouteContext({
        route: '/app/library',
        authFailure: 'notFound',
        dashboardErrorMessage: 'Failed to load library data.',
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('uses notFound when a required shell flag is disabled', async () => {
    getAppFlagValueMock.mockResolvedValue(false);

    await expect(
      loadAppShellRouteContext({
        route: '/app/library',
        requiredFlag: 'SHELL_CHAT_V1',
        dashboardErrorMessage: 'Failed to load library data.',
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(getAppFlagValueMock).toHaveBeenCalledWith('SHELL_CHAT_V1', {
      userId: 'user_1',
    });
    expect(getDashboardShellDataMock).not.toHaveBeenCalled();
  });

  it('returns the route error surface when dashboard shell data fails', async () => {
    const dashboardLoadError = new Error('db unavailable');
    getDashboardShellDataMock.mockResolvedValue(
      shellData({ dashboardLoadError })
    );

    const result = await loadAppShellRouteContext({
      route: '/app/tasks',
      dashboardErrorLogMessage: 'Dashboard data load failed on tasks page',
      dashboardErrorMessage: 'Failed to load tasks data.',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      render(result.error);
      expect(screen.getByTestId('page-error')).toHaveTextContent(
        'Failed to load tasks data.'
      );
    }
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Dashboard data load failed on tasks page',
      dashboardLoadError,
      { route: '/app/tasks' }
    );
  });

  it('redirects incomplete profiles through onboarding before route prefetches', async () => {
    getDashboardShellDataMock.mockResolvedValue(
      shellData({ needsOnboarding: true })
    );

    await expect(
      loadAppShellRouteContext({
        route: '/app/tasks',
        dashboardErrorMessage: 'Failed to load tasks data.',
      })
    ).rejects.toThrow('NEXT_REDIRECT:/start');
  });

  it('returns the shell context and selected profile id for route prefetches', async () => {
    const data = shellData({ selectedProfile: { id: 'profile_2' } });
    getDashboardShellDataMock.mockResolvedValue(data);

    const result = await loadAppShellRouteContext({
      route: '/app/releases',
      dashboardErrorMessage: 'Failed to load releases data.',
    });

    expect(result).toMatchObject({
      ok: true,
      userId: 'user_1',
      dashboardData: data,
      profileId: 'profile_2',
    });
  });

  it('uses a caller-provided authenticated user id without a second auth lookup', async () => {
    const data = shellData({ selectedProfile: { id: 'profile_3' } });
    getDashboardShellDataMock.mockResolvedValue(data);

    const result = await loadAppShellRouteContext({
      route: '/app/audience',
      authenticatedUserId: 'user_from_page',
      dashboardErrorMessage: 'Failed to load audience data.',
    });

    expect(getCachedAuthMock).not.toHaveBeenCalled();
    expect(getDashboardShellDataMock).toHaveBeenCalledWith('user_from_page');
    expect(result).toMatchObject({
      ok: true,
      userId: 'user_from_page',
      dashboardData: data,
      profileId: 'profile_3',
    });
  });
});
