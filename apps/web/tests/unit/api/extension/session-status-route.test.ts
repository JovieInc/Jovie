import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetOptionalAuth = vi.hoisted(() => vi.fn());
const mockGetSessionContext = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mockGetSessionContext,
}));

describe('GET /api/extension/session/status', () => {
  let GET: typeof import('@/app/api/extension/session/status/route').GET;

  beforeAll(async () => {
    ({ GET } = await import('@/app/api/extension/session/status/route'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns signed out when no Clerk session exists', async () => {
    mockGetOptionalAuth.mockResolvedValue({ userId: null });

    const response = await GET(
      new Request('http://localhost/api/extension/session/status')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      signedIn: false,
      profile: null,
    });
  });

  it('returns the profile summary for a signed-in session', async () => {
    mockGetOptionalAuth.mockResolvedValue({ userId: 'user_clerk_1' });
    mockGetSessionContext.mockResolvedValue({
      profile: {
        id: 'profile_1',
        displayName: 'Tim White',
        username: 'timwhite',
        usernameNormalized: 'timwhite',
        avatarUrl: 'https://img.example.com/tim.png',
      },
    });

    const response = await GET(
      new Request('http://localhost/api/extension/session/status')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      signedIn: true,
      profile: {
        id: 'profile_1',
        displayName: 'Tim White',
        username: 'timwhite',
        avatarUrl: 'https://img.example.com/tim.png',
      },
    });
  });
});
