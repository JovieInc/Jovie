import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildAppleWalletPassFileNameMock: vi.fn(),
  buildAppleWalletPassResponseHeadersMock: vi.fn(),
  captureErrorMock: vi.fn(),
  ensureAppleWalletProfilePassMock: vi.fn(),
  generateAppleWalletProfilePassBufferMock: vi.fn(),
  getCachedSessionTokenAuthMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  isAppleWalletConfiguredMock: vi.fn(),
  isProfileCompleteMock: vi.fn(),
  loadAppleWalletProfileMock: vi.fn(),
  recordAppleWalletPassDownloadMock: vi.fn(),
  toAppleWalletPassResponseBodyMock: vi.fn(),
  verifyProfileOwnershipMock: vi.fn(),
  withDbSessionTxMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedSessionTokenAuth: hoisted.getCachedSessionTokenAuthMock,
}));

vi.mock('@/lib/auth/profile-completeness', () => ({
  isProfileComplete: hoisted.isProfileCompleteMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
  withDbSessionTx: hoisted.withDbSessionTxMock,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: hoisted.verifyProfileOwnershipMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/wallet/apple/profile-pass', () => ({
  AppleWalletConfigError: class AppleWalletConfigError extends Error {},
  buildAppleWalletPassFileName: hoisted.buildAppleWalletPassFileNameMock,
  buildAppleWalletPassResponseHeaders:
    hoisted.buildAppleWalletPassResponseHeadersMock,
  ensureAppleWalletProfilePass: hoisted.ensureAppleWalletProfilePassMock,
  generateAppleWalletProfilePassBuffer:
    hoisted.generateAppleWalletProfilePassBufferMock,
  isAppleWalletConfigured: hoisted.isAppleWalletConfiguredMock,
  loadAppleWalletProfile: hoisted.loadAppleWalletProfileMock,
  recordAppleWalletPassDownload: hoisted.recordAppleWalletPassDownloadMock,
  toAppleWalletPassResponseBody: hoisted.toAppleWalletPassResponseBodyMock,
}));

const routeModulePromise = import('@/app/api/wallet/apple/profile-pass/route');

function makeRequest(profileId = 'profile_123') {
  return new NextRequest(
    `https://jov.ie/api/wallet/apple/profile-pass?profileId=${profileId}`
  );
}

describe('GET /api/wallet/apple/profile-pass', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.getCachedSessionTokenAuthMock.mockResolvedValue({
      userId: 'user_123',
    });
    hoisted.isAppleWalletConfiguredMock.mockReturnValue(true);
    hoisted.withDbSessionTxMock.mockImplementation(
      async (callback: (tx: unknown, clerkUserId: string) => unknown) =>
        callback({ tx: true }, 'user_123')
    );
    hoisted.verifyProfileOwnershipMock.mockResolvedValue({ id: 'profile_123' });
    hoisted.loadAppleWalletProfileMock.mockResolvedValue({
      username: 'timwhite',
      usernameNormalized: 'timwhite',
      displayName: 'Tim White',
      isPublic: true,
      onboardingCompletedAt: new Date('2026-04-01T00:00:00.000Z'),
    });
    hoisted.isProfileCompleteMock.mockReturnValue(true);
    hoisted.ensureAppleWalletProfilePassMock.mockResolvedValue({
      pass: { id: 'pass_123' },
      authenticationToken: 'auth_token',
    });
    hoisted.generateAppleWalletProfilePassBufferMock.mockResolvedValue(
      Buffer.from('pkpass')
    );
    hoisted.toAppleWalletPassResponseBodyMock.mockImplementation(
      (buffer: Buffer) => buffer
    );
    hoisted.buildAppleWalletPassFileNameMock.mockReturnValue('timwhite.pkpass');
    hoisted.buildAppleWalletPassResponseHeadersMock.mockReturnValue({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="timwhite.pkpass"',
    });
  });

  it('generates a pass for an authenticated complete profile without a rollout flag', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.apple.pkpass'
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('pkpass');
    expect(hoisted.ensureAppleWalletProfilePassMock).toHaveBeenCalledOnce();
    expect(hoisted.recordAppleWalletPassDownloadMock).toHaveBeenCalledWith(
      { tx: true },
      'pass_123'
    );
  });

  it('still requires an authenticated session', async () => {
    hoisted.getCachedSessionTokenAuthMock.mockResolvedValue({ userId: null });

    const { GET } = await routeModulePromise;
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(hoisted.ensureAppleWalletProfilePassMock).not.toHaveBeenCalled();
  });
});
