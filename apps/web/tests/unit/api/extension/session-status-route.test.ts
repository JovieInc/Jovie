import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetSessionContext = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mockGetSessionContext,
}));

describe('GET /api/extension/session/status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns signed out when no Clerk session exists', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/extension/session/status/route');
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
    mockAuth.mockResolvedValue({ userId: 'user_clerk_1' });
    mockGetSessionContext.mockResolvedValue({
      profile: {
        id: 'profile_1',
        displayName: 'Tim White',
        username: 'timwhite',
        usernameNormalized: 'timwhite',
        avatarUrl: 'https://img.example.com/tim.png',
      },
    });

    const { GET } = await import('@/app/api/extension/session/status/route');
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
