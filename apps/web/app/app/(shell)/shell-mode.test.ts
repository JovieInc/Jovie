import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { getCurrentAdminPageAccessMock, redirectMock } = vi.hoisted(() => ({
  getCurrentAdminPageAccessMock: vi.fn(),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/admin/page-access', () => ({
  getCurrentAdminPageAccess: getCurrentAdminPageAccessMock,
}));

import { requireAppShellModeAccess, resolveAppShellMode } from './shell-mode';

describe('app shell mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    APP_ROUTES.OV,
    `${APP_ROUTES.OV}/ops`,
  ])('resolves %s to OV mode', pathname => {
    expect(resolveAppShellMode(pathname)).toBe('ov');
  });

  it.each([
    APP_ROUTES.DASHBOARD,
    APP_ROUTES.CHAT,
    '/app/overview',
  ])('keeps %s in customer mode', pathname => {
    expect(resolveAppShellMode(pathname)).toBe('customer');
  });

  it('does not consult admin access for customer routes', async () => {
    await expect(
      requireAppShellModeAccess('customer')
    ).resolves.toBeUndefined();

    expect(getCurrentAdminPageAccessMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('allows role-authorized admins into OV mode', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      userId: 'user_admin',
      isAuthenticated: true,
      hasAdminRole: true,
    });

    await expect(requireAppShellModeAccess('ov')).resolves.toBeUndefined();

    expect(getCurrentAdminPageAccessMock).toHaveBeenCalledOnce();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      userId: 'user_member',
      isAuthenticated: true,
      hasAdminRole: false,
    },
    { userId: null, isAuthenticated: false, hasAdminRole: false },
  ])('redirects unauthorized OV requests before shell data renders', async access => {
    getCurrentAdminPageAccessMock.mockResolvedValue(access);

    await expect(requireAppShellModeAccess('ov')).rejects.toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.DASHBOARD}`
    );
    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });
});
