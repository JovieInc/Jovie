import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpersonationBannerWrapper } from './ImpersonationBannerWrapper';

const {
  mockGetFreshAuth,
  mockGetImpersonationState,
  mockIsImpersonationEnabled,
} = vi.hoisted(() => ({
  mockGetFreshAuth: vi.fn(),
  mockGetImpersonationState: vi.fn(),
  mockIsImpersonationEnabled: vi.fn(),
}));

vi.mock('@/lib/admin/impersonation', () => ({
  getImpersonationState: mockGetImpersonationState,
  isImpersonationEnabled: mockIsImpersonationEnabled,
}));

vi.mock('@/lib/auth/cached', () => ({
  getFreshAuth: mockGetFreshAuth,
}));

vi.mock('./ImpersonationBanner', () => ({
  ImpersonationBanner: () => (
    <div data-testid='impersonation-banner'>Active impersonation</div>
  ),
}));

describe('ImpersonationBannerWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsImpersonationEnabled.mockReturnValue(true);
    mockGetFreshAuth.mockResolvedValue({
      actorUserId: 'admin-actor-id',
      userId: 'effective-user-id',
    });
    mockGetImpersonationState.mockResolvedValue({
      effectiveUserId: 'effective-user-id',
    });
  });

  it('skips authentication when impersonation is disabled', async () => {
    mockIsImpersonationEnabled.mockReturnValue(false);

    await expect(ImpersonationBannerWrapper()).resolves.toBeNull();

    expect(mockGetFreshAuth).not.toHaveBeenCalled();
    expect(mockGetImpersonationState).not.toHaveBeenCalled();
  });

  it('does not read impersonation state without an authenticated user', async () => {
    mockGetFreshAuth.mockResolvedValue({
      actorUserId: null,
      userId: null,
    });

    await expect(ImpersonationBannerWrapper()).resolves.toBeNull();

    expect(mockGetImpersonationState).not.toHaveBeenCalled();
  });

  it('uses the authenticated user id when no actor identity is present', async () => {
    mockGetFreshAuth.mockResolvedValue({
      actorUserId: null,
      userId: 'admin-user-id',
    });
    mockGetImpersonationState.mockResolvedValue(null);

    await expect(ImpersonationBannerWrapper()).resolves.toBeNull();

    expect(mockGetImpersonationState).toHaveBeenCalledWith('admin-user-id');
  });

  it('uses the administrator actor id and renders the active banner', async () => {
    render(await ImpersonationBannerWrapper());

    expect(mockGetImpersonationState).toHaveBeenCalledWith('admin-actor-id');
    expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
  });
});
