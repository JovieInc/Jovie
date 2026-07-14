import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockIsExplicitDevelopmentEnvironment,
  mockGetCurrentUserEntitlements,
  mockGetWaitlistAccess,
  mockWithSystemIngestionSession,
  mockApproveWaitlistEntryInTx,
  mockFinalizeWaitlistApproval,
  mockInvalidateProxyUserStateCache,
} = vi.hoisted(() => ({
  mockIsExplicitDevelopmentEnvironment: vi.fn(),
  mockGetCurrentUserEntitlements: vi.fn(),
  mockGetWaitlistAccess: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
  mockApproveWaitlistEntryInTx: vi.fn(),
  mockFinalizeWaitlistApproval: vi.fn(),
  mockInvalidateProxyUserStateCache: vi.fn(),
}));

vi.mock('@/lib/security/development-only', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/security/development-only')
  >('@/lib/security/development-only');
  return {
    ...actual,
    isExplicitDevelopmentEnvironment: mockIsExplicitDevelopmentEnvironment,
  };
});

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/auth/gate', () => ({
  getWaitlistAccess: mockGetWaitlistAccess,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlistEntryInTx,
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

describe('POST /api/dev/unwaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    // Default happy-path stubs; individual tests override as needed.
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      email: 'artist@example.com',
      userId: 'user_123',
    });
    mockGetWaitlistAccess.mockResolvedValue({
      entryId: 'entry_1',
      status: 'pending',
    });
    mockWithSystemIngestionSession.mockImplementation(
      async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({ __fakeTx: true })
    );
    mockApproveWaitlistEntryInTx.mockResolvedValue({
      outcome: 'approved',
      entryId: 'entry_1',
      profileId: 'profile_1',
      email: 'artist@example.com',
      fullName: 'Artist Example',
      clerkId: 'user_123',
    });
    mockFinalizeWaitlistApproval.mockResolvedValue(undefined);
  });

  it('returns 403 and never touches downstream helpers outside development', async () => {
    mockIsExplicitDevelopmentEnvironment.mockReturnValue(false);

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Not available outside development',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    // This is a fail-closed dev-bypass surface: nothing downstream may run.
    expect(mockGetCurrentUserEntitlements).not.toHaveBeenCalled();
    expect(mockGetWaitlistAccess).not.toHaveBeenCalled();
    expect(mockWithSystemIngestionSession).not.toHaveBeenCalled();
    expect(mockApproveWaitlistEntryInTx).not.toHaveBeenCalled();
    expect(mockFinalizeWaitlistApproval).not.toHaveBeenCalled();
    expect(mockInvalidateProxyUserStateCache).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated in development', async () => {
    mockIsExplicitDevelopmentEnvironment.mockReturnValue(true);
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      email: null,
      userId: null,
    });

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Not authenticated',
    });
    expect(mockGetWaitlistAccess).not.toHaveBeenCalled();
  });

  it('returns 404 when no waitlist entry exists for the email', async () => {
    mockIsExplicitDevelopmentEnvironment.mockReturnValue(true);
    mockGetWaitlistAccess.mockResolvedValue({ entryId: null, status: null });

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: 'No waitlist entry found for this email',
    });
    expect(mockWithSystemIngestionSession).not.toHaveBeenCalled();
  });

  it('approves the waitlist entry and returns 200 on the happy path', async () => {
    mockIsExplicitDevelopmentEnvironment.mockReturnValue(true);

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Waitlist entry approved — reload to access the dashboard',
      profileId: 'profile_1',
    });
    expect(mockApproveWaitlistEntryInTx).toHaveBeenCalledWith(
      { __fakeTx: true },
      'entry_1'
    );
    expect(mockFinalizeWaitlistApproval).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'approved', entryId: 'entry_1' })
    );
  });

  it('returns 200 already-approved and still invalidates the proxy cache when already processed', async () => {
    mockIsExplicitDevelopmentEnvironment.mockReturnValue(true);
    mockApproveWaitlistEntryInTx.mockResolvedValue({
      outcome: 'already_processed',
      status: 'approved',
    });

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Already approved',
      status: 'approved',
    });
    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledWith('user_123');
    expect(mockFinalizeWaitlistApproval).not.toHaveBeenCalled();
  });

  it('returns 422 for an unexpected approval outcome', async () => {
    mockIsExplicitDevelopmentEnvironment.mockReturnValue(true);
    mockApproveWaitlistEntryInTx.mockResolvedValue({ outcome: 'no_user' });

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Unexpected outcome: no_user',
    });
    expect(mockFinalizeWaitlistApproval).not.toHaveBeenCalled();
  });
});
