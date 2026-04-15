import { describe, expect, it, vi } from 'vitest';
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

describe('dashboard earnings page', () => {
  it('redirects unauthenticated users to sign-in with the legacy route as the return target', async () => {
    getCachedAuthMock.mockResolvedValueOnce({ userId: null });

    await expect(EarningsPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_EARNINGS}`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_EARNINGS}`
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
