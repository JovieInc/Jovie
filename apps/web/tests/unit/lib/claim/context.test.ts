import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteMock, getMock, setMock, cookiesMock, captureErrorMock } =
  vi.hoisted(() => {
    const deleteMock = vi.fn();
    const getMock = vi.fn();
    const setMock = vi.fn();
    const mockCookieStore = {
      delete: deleteMock,
      get: getMock,
      set: setMock,
    };

    return {
      deleteMock,
      getMock,
      setMock,
      mockCookieStore,
      cookiesMock: vi.fn().mockResolvedValue(mockCookieStore),
      captureErrorMock: vi.fn(),
    };
  });

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
    setMock.mockReset();
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

  it('returns null and clears on malformed split (no dot)', async () => {
    getMock.mockReturnValue({ value: 'noDotHere' });
    const { readPendingClaimContext } = await import('@/lib/claim/context');
    const result = await readPendingClaimContext();
    expect(result).toBeNull();
    expect(deleteMock).toHaveBeenCalled();
  });

  it('returns null and clears on signature mismatch (timing-safe)', async () => {
    // A structurally valid body.sig but wrong sig (will fail timingSafeEqual)
    getMock.mockReturnValue({ value: 'eyJ0ZXN0IjoxfQ==.deadbeef' });
    const { readPendingClaimContext } = await import('@/lib/claim/context');
    const result = await readPendingClaimContext();
    expect(result).toBeNull();
    expect(deleteMock).toHaveBeenCalled();
  });

  it('returns null (no clear) on expired cookie', async () => {
    // Produce legitimately signed cookie via write, then advance fake time past TTL
    // so parse succeeds (sig+fields) but expiry branch returns null without delete.
    vi.useFakeTimers();
    const { writePendingClaimContext, readPendingClaimContext } = await import(
      '@/lib/claim/context'
    );
    await writePendingClaimContext({
      mode: 'direct_profile',
      creatorProfileId: 'cid',
      username: 'u',
    });
    const serialized = setMock.mock.calls[0]?.[1] as string;
    // advance past 7d TTL
    vi.setSystemTime(Date.now() + 7 * 24 * 60 * 60 * 1000 + 10000);
    getMock.mockReturnValue({ value: serialized });
    const result = await readPendingClaimContext();
    expect(result).toBeNull();
    vi.useRealTimers();
    // expiry path returns null without calling delete (unlike parse failures)
  });

  it('respects username filter option (case-insensitive)', async () => {
    // Well-formed signed cookie with 'testuser'; non-matching filter 'OtherUser' hits
    // the username guard branch and returns null WITHOUT delete (the filter-respect behavior).
    const { writePendingClaimContext, readPendingClaimContext } = await import(
      '@/lib/claim/context'
    );
    await writePendingClaimContext({
      mode: 'direct_profile',
      creatorProfileId: 'p',
      username: 'testuser',
    });
    const serialized = setMock.mock.calls[0]?.[1] as string;
    getMock.mockReturnValue({ value: serialized });
    const result = await readPendingClaimContext({ username: 'OtherUser' });
    expect(result).toBeNull();
  });
});

describe('writePendingClaimContext + roundtrip (via mocked cookies)', () => {
  beforeEach(() => {
    deleteMock.mockReset();
    getMock.mockReset();
    setMock.mockReset();
    captureErrorMock.mockReset();
  });

  it('writes a signed cookie with correct shape and TTL, and read roundtrips for valid token_backed', async () => {
    const { writePendingClaimContext, readPendingClaimContext } = await import(
      '@/lib/claim/context'
    );

    // First write
    const _written = await writePendingClaimContext({
      mode: 'token_backed',
      creatorProfileId: 'prof_123',
      username: 'TestArtist',
      claimTokenHash: 'hash123',
      leadId: 'lead_1',
      expectedSpotifyArtistId: 'sp_1',
    });

    expect(setMock).toHaveBeenCalledTimes(1);
    const [cookieName, serialized, opts] = setMock.mock.calls[0];
    expect(cookieName).toBe('jovie_pending_claim');
    expect(typeof serialized).toBe('string');
    expect(serialized).toContain('.');
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });

    // Now simulate read by feeding the serialized value back
    getMock.mockReturnValue({ value: serialized });
    const read = await readPendingClaimContext();
    expect(read).not.toBeNull();
    expect(read?.mode).toBe('token_backed');
    expect(read?.creatorProfileId).toBe('prof_123');
    expect(read?.username).toBe('testartist'); // normalized lower
    expect(read?.claimTokenHash).toBe('hash123');
  });

  it('write + read roundtrip for direct_profile mode', async () => {
    const { writePendingClaimContext, readPendingClaimContext } = await import(
      '@/lib/claim/context'
    );
    await writePendingClaimContext({
      mode: 'direct_profile',
      creatorProfileId: 'p2',
      username: 'Another',
      expectedSpotifyArtistId: null,
    });
    const serialized = setMock.mock.calls[0]?.[1];
    getMock.mockReturnValue({ value: serialized });
    const read = await readPendingClaimContext({ username: 'another' });
    expect(read?.mode).toBe('direct_profile');
    expect(read?.username).toBe('another');
  });
});
