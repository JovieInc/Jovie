import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildAppleWalletPassFileNameMock,
  buildAppleWalletPassResponseHeadersMock,
  captureErrorMock,
  ensureAppleWalletProfilePassMock,
  generateAppleWalletProfilePassBufferMock,
  getAppFlagValueMock,
  getCachedSessionTokenAuthMock,
  getSessionContextMock,
  isAppleWalletConfiguredMock,
  isProfileCompleteMock,
  loadAppleWalletProfileMock,
  recordAppleWalletPassDownloadMock,
  toAppleWalletPassResponseBodyMock,
  verifyProfileOwnershipMock,
  withDbSessionTxMock,
} = vi.hoisted(() => ({
  buildAppleWalletPassFileNameMock: vi.fn(),
  buildAppleWalletPassResponseHeadersMock: vi.fn(),
  captureErrorMock: vi.fn(),
  ensureAppleWalletProfilePassMock: vi.fn(),
  generateAppleWalletProfilePassBufferMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
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

class MockAppleWalletConfigError extends Error {}

vi.mock('@/lib/auth/cached', () => ({
  getCachedSessionTokenAuth: getCachedSessionTokenAuthMock,
}));

vi.mock('@/lib/auth/profile-completeness', () => ({
  isProfileComplete: isProfileCompleteMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: getSessionContextMock,
  withDbSessionTx: withDbSessionTxMock,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: verifyProfileOwnershipMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('@/lib/wallet/apple/profile-pass', () => ({
  AppleWalletConfigError: MockAppleWalletConfigError,
  buildAppleWalletPassFileName: buildAppleWalletPassFileNameMock,
  buildAppleWalletPassResponseHeaders: buildAppleWalletPassResponseHeadersMock,
  ensureAppleWalletProfilePass: ensureAppleWalletProfilePassMock,
  generateAppleWalletProfilePassBuffer:
    generateAppleWalletProfilePassBufferMock,
  isAppleWalletConfigured: isAppleWalletConfiguredMock,
  loadAppleWalletProfile: loadAppleWalletProfileMock,
  recordAppleWalletPassDownload: recordAppleWalletPassDownloadMock,
  toAppleWalletPassResponseBody: toAppleWalletPassResponseBodyMock,
}));

const routeModulePromise = import('@/app/api/wallet/apple/profile-pass/route');

function profilePassRequest(profileId = 'profile_123') {
  return new NextRequest(
    `https://jov.ie/api/wallet/apple/profile-pass?profileId=${profileId}`
  );
}

describe('GET /api/wallet/apple/profile-pass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedSessionTokenAuthMock.mockResolvedValue({ userId: 'clerk_123' });
    getAppFlagValueMock.mockResolvedValue(true);
    isAppleWalletConfiguredMock.mockReturnValue(true);
    getSessionContextMock.mockResolvedValue({
      profile: { id: 'session_profile_123' },
    });
    verifyProfileOwnershipMock.mockResolvedValue(true);
    loadAppleWalletProfileMock.mockResolvedValue({
      id: 'profile_123',
      username: 'testartist',
      usernameNormalized: 'testartist',
      displayName: 'Test Artist',
      isPublic: true,
      onboardingCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    isProfileCompleteMock.mockReturnValue(true);
    ensureAppleWalletProfilePassMock.mockResolvedValue({
      pass: { id: 'pass_123' },
      authenticationToken: 'token_123',
    });
    generateAppleWalletProfilePassBufferMock.mockResolvedValue(
      new Uint8Array([1, 2, 3])
    );
    recordAppleWalletPassDownloadMock.mockResolvedValue(undefined);
    toAppleWalletPassResponseBodyMock.mockReturnValue(
      new Uint8Array([1, 2, 3])
    );
    buildAppleWalletPassFileNameMock.mockReturnValue('testartist.pkpass');
    buildAppleWalletPassResponseHeadersMock.mockReturnValue({
      'Content-Disposition': 'attachment; filename="testartist.pkpass"',
      'Content-Type': 'application/vnd.apple.pkpass',
    });
    withDbSessionTxMock.mockImplementation(async (callback, options) =>
      callback({ tx: true }, options?.clerkUserId)
    );
  });

  it('returns unauthorized for signed-out users', async () => {
    getCachedSessionTokenAuthMock.mockResolvedValueOnce({ userId: null });

    const { GET } = await routeModulePromise;
    const response = await GET(profilePassRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(getAppFlagValueMock).not.toHaveBeenCalled();
  });

  it('returns not found when the Wallet profile pass kill switch is off', async () => {
    getAppFlagValueMock.mockResolvedValueOnce(false);

    const { GET } = await routeModulePromise;
    const response = await GET(profilePassRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(isAppleWalletConfiguredMock).not.toHaveBeenCalled();
  });

  it('generates a pass for an owned complete public profile', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(profilePassRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.apple.pkpass'
    );
    expect(getAppFlagValueMock).toHaveBeenCalledWith(
      'APPLE_WALLET_PROFILE_PASS',
      { userId: 'clerk_123' }
    );
    expect(verifyProfileOwnershipMock).toHaveBeenCalledWith(
      { tx: true },
      'profile_123',
      'clerk_123'
    );
    expect(generateAppleWalletProfilePassBufferMock).toHaveBeenCalledWith(
      { id: 'pass_123' },
      'token_123'
    );
    expect(recordAppleWalletPassDownloadMock).toHaveBeenCalledWith(
      { tx: true },
      'pass_123'
    );
  });
});
