import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteMock, getMock, cookiesMock, captureErrorMock } = vi.hoisted(
  () => {
    const deleteMock = vi.fn();
    const getMock = vi.fn();
    const mockCookieStore = {
      delete: deleteMock,
      get: getMock,
      set: vi.fn(),
    };

    return {
      deleteMock,
      getMock,
      mockCookieStore,
      cookiesMock: vi.fn().mockResolvedValue(mockCookieStore),
      captureErrorMock: vi.fn(),
    };
  }
);

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    URL_ENCRYPTION_KEY: 'test-secret',
  },
  isSecureEnv: () => false,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

describe('readPendingClaimContext', () => {
  beforeEach(() => {
    deleteMock.mockReset();
    getMock.mockReset();
    captureErrorMock.mockReset();
  });

  it('returns null and clears invalid cookies defensively', async () => {
    getMock.mockReturnValue({
      value: 'invalid-pending-claim-cookie',
    });

    const { readPendingClaimContext } = await import('@/lib/claim/context');
    const result = await readPendingClaimContext();

    expect(result).toBeNull();
    // Implementation defensively clears malformed cookies
    expect(deleteMock).toHaveBeenCalled();
  });
});
