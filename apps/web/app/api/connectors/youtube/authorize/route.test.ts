import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getExactProfileAccess: vi.fn(),
  captureError: vi.fn(),
  env: {
    GOOGLE_OAUTH_CLIENT_ID: 'youtube-client-id' as string | undefined,
    YOUTUBE_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'youtube-state-secret',
    CRON_SECRET: undefined,
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.getExactProfileAccess,
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

const profileId = '22222222-2222-4222-8222-222222222222';

function request(returnTo = '/app/library') {
  const url = new URL('http://localhost/api/connectors/youtube/authorize');
  url.searchParams.set('creatorProfileId', profileId);
  url.searchParams.set('returnTo', returnTo);
  return new Request(url);
}

describe('GET /api/connectors/youtube/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.GOOGLE_OAUTH_CLIENT_ID = 'youtube-client-id';
    mocks.env.YOUTUBE_OAUTH_REDIRECT_URI_BASE = undefined;
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getExactProfileAccess.mockResolvedValue({ ok: true });
  });

  it('requires authentication and exact profile access', async () => {
    const { GET } = await import('./route');
    mocks.getCachedAuth.mockResolvedValueOnce({ userId: null });
    const signedOut = await GET(request());
    expect(signedOut.headers.get('location')).toBe('http://localhost/sign-in');

    mocks.getCachedAuth.mockResolvedValueOnce({ userId: 'user-1' });
    mocks.getExactProfileAccess.mockResolvedValueOnce({ ok: false });
    const forbidden = await GET(request());
    expect(forbidden.headers.get('location')).toBe(
      'http://localhost/app/library?error=youtube_profile_access'
    );
  });

  it('signs the creator profile and least-privilege scopes into the OAuth handoff', async () => {
    const { GET } = await import('./route');
    const response = await GET(request('/app/library?stage=out'));
    const location = new URL(response.headers.get('location') as string);

    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(location.searchParams.get('scope')?.split(' ')).toEqual([
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ]);
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost/api/connectors/youtube/callback'
    );
    const state = verifyGoogleOAuthState(
      location.searchParams.get('state') as string
    );
    expect(state).toMatchObject({
      userId: 'user-1',
      creatorProfileId: profileId,
      returnTo: '/app/library?stage=out',
    });
  });

  it('fails a protocol-relative return target closed to Library', async () => {
    const { GET } = await import('./route');
    const response = await GET(request('//evil.example/path'));
    const location = new URL(response.headers.get('location') as string);
    const state = verifyGoogleOAuthState(
      location.searchParams.get('state') as string
    );
    expect(state.returnTo).toBe('/app/library');
  });

  it('stays in Library when YouTube OAuth is not configured', async () => {
    mocks.env.GOOGLE_OAUTH_CLIENT_ID = undefined;
    const { GET } = await import('./route');
    const response = await GET(request());
    expect(response.headers.get('location')).toBe(
      'http://localhost/app/library?error=youtube_not_configured'
    );
  });
});
