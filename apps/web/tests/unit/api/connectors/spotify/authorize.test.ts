/**
 * GET /api/connectors/spotify/authorize — only env/auth/error-tracking are
 * mocked, so the state token is verified through the real HMAC helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { SPOTIFY_OAUTH_SCOPES } from '@/lib/connectors/spotify/scopes';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    SPOTIFY_CLIENT_ID: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' as string | undefined,
    SPOTIFY_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'test-oauth-state-secret' as string | undefined,
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));
vi.mock('@/lib/env-server', () => ({
  env: hoisted.mockEnv,
  isTestEnv: () => true,
}));

const request = (query = '') =>
  new Request(`http://localhost/api/connectors/spotify/authorize${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.mockEnv.SPOTIFY_CLIENT_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  hoisted.mockEnv.SPOTIFY_OAUTH_REDIRECT_URI_BASE = undefined;
  hoisted.mockEnv.TRACKING_TOKEN_SECRET = 'test-oauth-state-secret';
  hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
});

const LOAD_ROUTE = () => import('@/app/api/connectors/spotify/authorize/route');

describe('GET /api/connectors/spotify/authorize', () => {
  it('redirects to sign-in when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });
    const { GET } = await LOAD_ROUTE();
    const response = await GET(request());
    expect(response.headers.get('location')).toBe('http://localhost/sign-in');
  });

  it('redirects with ?error=spotify_not_configured when SPOTIFY_CLIENT_ID is missing', async () => {
    hoisted.mockEnv.SPOTIFY_CLIENT_ID = undefined;
    const { GET } = await LOAD_ROUTE();
    const response = await GET(request());
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_not_configured`
    );
  });

  it('builds a Spotify authorize URL with canonical scopes and a real verifiable state', async () => {
    const { GET } = await LOAD_ROUTE();
    const response = await GET(request('?returnTo=%2Fapp%2Fcustom'));
    const url = new URL(response.headers.get('location') as string);

    expect(url.origin + url.pathname).toBe(
      'https://accounts.spotify.com/authorize'
    );
    expect(url.searchParams.get('client_id')).toBe(
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost/api/connectors/spotify/callback'
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('show_dialog')).toBe('true');
    expect((url.searchParams.get('scope') as string).split(' ')).toEqual(
      expect.arrayContaining([...SPOTIFY_OAUTH_SCOPES])
    );
    const decoded = verifyGoogleOAuthState(
      url.searchParams.get('state') as string
    );
    expect(decoded.userId).toBe('db-user-1');
    expect(decoded.returnTo).toBe('/app/custom');
  });

  it('falls back to the connectors settings route when returnTo is not an in-app path', async () => {
    const { GET } = await LOAD_ROUTE();
    const response = await GET(request('?returnTo=https%3A%2F%2Fevil.example'));
    const url = new URL(response.headers.get('location') as string);
    const decoded = verifyGoogleOAuthState(
      url.searchParams.get('state') as string
    );
    expect(decoded.returnTo).toBe(APP_ROUTES.SETTINGS_CONNECTORS);
  });

  it('uses SPOTIFY_OAUTH_REDIRECT_URI_BASE when configured instead of the request origin', async () => {
    hoisted.mockEnv.SPOTIFY_OAUTH_REDIRECT_URI_BASE =
      'https://redirect.example.com/api/connectors/spotify';
    const { GET } = await LOAD_ROUTE();
    const response = await GET(request());
    const url = new URL(response.headers.get('location') as string);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://redirect.example.com/api/connectors/spotify/callback'
    );
  });

  it('redirects with ?error=spotify_oauth_start and captures the error on unexpected failure', async () => {
    hoisted.getCachedAuthMock.mockRejectedValue(new Error('auth unavailable'));
    const { GET } = await LOAD_ROUTE();
    const response = await GET(request());
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}?error=spotify_oauth_start`
    );
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify OAuth authorize failed',
      expect.any(Error)
    );
  });
});
