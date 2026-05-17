import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock, getCachedAuthMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  getCachedAuthMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: getCachedAuthMock,
}));

import EarningsPage from '@/app/app/(shell)/dashboard/earnings/page';
import CanonicalEarningsPage from '@/app/app/(shell)/earnings/page';

beforeEach(() => {
  redirectMock.mockClear();
  getCachedAuthMock.mockReset();
});

describe('dashboard earnings page', () => {
  it('redirects unauthenticated users to sign-in with the legacy route as the return target', async () => {
    getCachedAuthMock.mockResolvedValueOnce({ userId: null });
    const encodedReturnPath = encodeURIComponent(APP_ROUTES.DASHBOARD_EARNINGS);

    await expect(EarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );
  });

  it('redirects authenticated users to artist profile tips', async () => {
    getCachedAuthMock.mockResolvedValueOnce({ userId: 'user_123' });

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
    getCachedAuthMock.mockResolvedValueOnce({ userId: null });
    const encodedReturnPath = encodeURIComponent(APP_ROUTES.EARNINGS);

    await expect(CanonicalEarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SIGNIN}?redirect_url=${encodedReturnPath}`
    );
  });

  it('redirects authenticated users to artist profile tips', async () => {
    getCachedAuthMock.mockResolvedValueOnce({ userId: 'user_123' });

    await expect(CanonicalEarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );
  });
});
