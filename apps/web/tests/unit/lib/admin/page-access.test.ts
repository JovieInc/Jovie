import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  getCurrentAdminPageAccess,
  requireCurrentAdminPageAccess,
} from '@/lib/admin/page-access';

const { mockPrivacy, mockGetCachedAuth, mockIsAdmin, mockRedirect } =
  vi.hoisted(() => ({
    mockPrivacy: vi.fn(),
    mockGetCachedAuth: vi.fn(),
    mockIsAdmin: vi.fn(),
    mockRedirect: vi.fn((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    }),
  }));

vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: mockPrivacy,
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

describe('getCurrentAdminPageAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrivacy.mockResolvedValue(undefined);
  });

  it('returns signed-out access without querying admin role', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    await expect(getCurrentAdminPageAccess()).resolves.toEqual({
      userId: null,
      isAuthenticated: false,
      hasAdminRole: false,
    });
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it('keeps admin page access role-based when MFA reverification is stale', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: 'user_admin',
      has: vi.fn().mockReturnValue(false),
    });
    mockIsAdmin.mockResolvedValue(true);

    await expect(getCurrentAdminPageAccess()).resolves.toEqual({
      userId: 'user_admin',
      isAuthenticated: true,
      hasAdminRole: true,
    });
    expect(mockIsAdmin).toHaveBeenCalledWith('user_admin');
  });

  it('denies page access for authenticated non-admins', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_member' });
    mockIsAdmin.mockResolvedValue(false);

    await expect(getCurrentAdminPageAccess()).resolves.toEqual({
      userId: 'user_member',
      isAuthenticated: true,
      hasAdminRole: false,
    });
  });

  it('redirects non-admins at the authoritative page read gate', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_member' });
    mockIsAdmin.mockResolvedValue(false);

    await expect(requireCurrentAdminPageAccess()).rejects.toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.DASHBOARD}`
    );
  });

  it('returns the authorized admin user id', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_admin' });
    mockIsAdmin.mockResolvedValue(true);

    await expect(requireCurrentAdminPageAccess()).resolves.toBe('user_admin');
  });
  it('denies private page loading while leaving navigation role intact', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_admin' });
    mockIsAdmin.mockResolvedValue(true);
    mockPrivacy.mockRejectedValue(Error('Privacy locked'));
    expect((await getCurrentAdminPageAccess()).hasAdminRole).toBe(true);
    await expect(requireCurrentAdminPageAccess()).rejects.toThrow(
      'Privacy locked'
    );
  });
});
