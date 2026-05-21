import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { loadAppShellRouteContextMock, redirectMock } = vi.hoisted(() => ({
  loadAppShellRouteContextMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadAppShellRouteContextMock,
}));

import EarningsPage from '@/app/app/(shell)/dashboard/earnings/page';
import CanonicalEarningsPage from '@/app/app/(shell)/earnings/page';

beforeEach(() => {
  redirectMock.mockClear();
  loadAppShellRouteContextMock.mockReset();
  loadAppShellRouteContextMock.mockResolvedValue({
    ok: true,
    userId: 'user_123',
    profileId: 'profile_123',
    dashboardData: {},
  });
});

describe('dashboard earnings page', () => {
  it('redirects unauthenticated users to sign-in with the legacy route as the return target', async () => {
    const encodedReturnPath = encodeURIComponent(APP_ROUTES.DASHBOARD_EARNINGS);
    loadAppShellRouteContextMock.mockRejectedValueOnce(
      new Error(
        `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
      )
    );

    await expect(EarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );

    expect(loadAppShellRouteContextMock).toHaveBeenCalledWith({
      route: APP_ROUTES.DASHBOARD_EARNINGS,
      dashboardErrorLogMessage: 'Dashboard data load failed on earnings page',
      dashboardErrorMessage:
        'Failed to load earnings settings. Please refresh the page.',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects authenticated users to artist profile tips', async () => {
    await expect(EarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );
  });
});

describe('canonical earnings page', () => {
  it('redirects unauthenticated users to sign-in with the canonical route as the return target', async () => {
    const encodedReturnPath = encodeURIComponent(APP_ROUTES.EARNINGS);
    loadAppShellRouteContextMock.mockRejectedValueOnce(
      new Error(
        `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
      )
    );

    await expect(CanonicalEarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );

    expect(loadAppShellRouteContextMock).toHaveBeenCalledWith({
      route: APP_ROUTES.EARNINGS,
      dashboardErrorLogMessage: 'Dashboard data load failed on earnings page',
      dashboardErrorMessage:
        'Failed to load earnings settings. Please refresh the page.',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects authenticated users to artist profile tips', async () => {
    await expect(CanonicalEarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );
  });

  it('keeps earnings route auth on the shared route context', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/app/(shell)/earnings/earnings-route.ts'),
      'utf8'
    );

    expect(source).toContain('loadAppShellRouteContext');
    expect(source).not.toContain('getCachedAuth');
    expect(source).not.toContain('buildAppShellSignInUrl');
    expect(source).not.toContain('getDashboardShellData');
  });
});
