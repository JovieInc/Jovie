import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const {
  dashboardShellContentMock,
  getAppFlagValueMock,
  getCachedAuthMock,
  getCurrentAdminPageAccessMock,
  headersMock,
  redirectMock,
} = vi.hoisted(() => ({
  dashboardShellContentMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
  getCachedAuthMock: vi.fn(),
  getCurrentAdminPageAccessMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock('@/components/organisms/CinematicAppBoot', () => ({
  CinematicAppBoot: ({ brandVariant }: { brandVariant?: string }) => (
    <div data-testid='shell-fallback' data-brand-variant={brandVariant} />
  ),
}));
vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: () => null,
}));
vi.mock('@/components/providers/NuqsProvider', () => ({
  NuqsProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/shell/LyricsRouteSkeleton', () => ({
  LyricsRouteSkeleton: () => null,
}));
vi.mock('@/components/shell/TasksRouteSkeleton', () => ({
  TasksRouteSkeleton: () => null,
}));
vi.mock('@/features/feedback/ErrorBanner', () => ({
  ErrorBanner: () => null,
}));

vi.mock('@/lib/admin/page-access', () => ({
  getCurrentAdminPageAccess: getCurrentAdminPageAccessMock,
}));
vi.mock('@/lib/auth/access-route-redirect', () => ({
  canAccessAppShell: () => true,
}));
vi.mock('@/lib/auth/build-app-shell-signin-url', () => ({
  buildAppShellSignInUrl: () => APP_ROUTES.SIGNIN,
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: getCachedAuthMock }));
vi.mock('@/lib/auth/gate', () => ({
  resolveUserState: vi.fn(() => ({ state: 'active' })),
}));
vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('./chat/loading', () => ({ default: () => null }));
vi.mock('./dashboard/releases/loading', () => ({
  ReleaseTableSkeleton: () => null,
}));
vi.mock('./library/LibrarySurface', () => ({
  LibraryLoadingState: () => null,
}));
vi.mock('./DashboardShellContent', () => ({
  DashboardShellContent: (props: {
    readonly children: ReactNode;
    readonly mode: string;
  }) => {
    dashboardShellContentMock(props);
    return <div data-shell-mode={props.mode}>{props.children}</div>;
  },
}));

import AppShellLayout from './layout';

describe('AppShellLayout OV mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedAuthMock.mockResolvedValue({ userId: 'user_test' });
    getAppFlagValueMock.mockResolvedValue(true);
  });

  it('terminates unauthorized OV requests before shell or flag data loads', async () => {
    headersMock.mockResolvedValue(
      new Headers({ 'x-jovie-app-shell-mode': 'ov' })
    );
    getCurrentAdminPageAccessMock.mockResolvedValue({
      userId: 'user_test',
      isAuthenticated: true,
      hasAdminRole: false,
    });

    await expect(
      AppShellLayout({ children: <div>private admin data</div> })
    ).rejects.toThrow(`NEXT_REDIRECT:${APP_ROUTES.DASHBOARD}`);

    expect(dashboardShellContentMock).not.toHaveBeenCalled();
    expect(getAppFlagValueMock).not.toHaveBeenCalled();
  });

  it('propagates authorized OV mode into the first server render', async () => {
    headersMock.mockResolvedValue(
      new Headers({ 'x-jovie-app-shell-mode': 'ov' })
    );
    getCurrentAdminPageAccessMock.mockResolvedValue({
      userId: 'user_test',
      isAuthenticated: true,
      hasAdminRole: true,
    });

    render(await AppShellLayout({ children: <div>OV content</div> }));

    expect(
      screen.getByText('OV content').closest('[data-shell-mode]')
    ).toHaveAttribute('data-shell-mode', 'ov');
  });

  it('does not consult the admin gate for customer routes', async () => {
    headersMock.mockResolvedValue(
      new Headers({ 'x-jovie-app-shell-mode': 'customer' })
    );

    render(await AppShellLayout({ children: <div>Customer content</div> }));

    expect(getCurrentAdminPageAccessMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Customer content').closest('[data-shell-mode]')
    ).toHaveAttribute('data-shell-mode', 'customer');
  });
});
