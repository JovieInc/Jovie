import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { loadAppShellRouteContextMock, redirectMock } = vi.hoisted(() => ({
  loadAppShellRouteContextMock: vi.fn(),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadAppShellRouteContextMock,
}));

import SettingsAdminPage from '@/app/app/(shell)/settings/admin/page';

beforeEach(() => {
  vi.clearAllMocks();
  loadAppShellRouteContextMock.mockResolvedValue({
    ok: true,
    dashboardData: { isAdmin: false },
  });
});

describe('settings admin route', () => {
  it('returns the shared route-context error when shell loading fails', async () => {
    const error = <div data-testid='admin-settings-error'>Load failed</div>;
    loadAppShellRouteContextMock.mockResolvedValueOnce({
      ok: false,
      error,
    });

    await expect(SettingsAdminPage()).resolves.toBe(error);

    expect(loadAppShellRouteContextMock).toHaveBeenCalledWith({
      route: APP_ROUTES.SETTINGS_ADMIN,
      dashboardErrorLogMessage:
        'Dashboard data load failed on settings admin redirect',
      dashboardErrorMessage:
        'Failed to load admin settings. Please refresh the page.',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects non-admin users back to artist profile settings', async () => {
    await expect(SettingsAdminPage()).rejects.toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.SETTINGS_ARTIST_PROFILE}`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      APP_ROUTES.SETTINGS_ARTIST_PROFILE
    );
  });

  it('redirects admins to the canonical admin ops surface', async () => {
    loadAppShellRouteContextMock.mockResolvedValueOnce({
      ok: true,
      dashboardData: { isAdmin: true },
    });

    await expect(SettingsAdminPage()).rejects.toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.ADMIN_OPS}`
    );

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.ADMIN_OPS);
  });
});
