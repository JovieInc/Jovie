/**
 * GET /api/connectors/spotify/callback — only db, auth, server-fetch, env, and
 * error-tracking are mocked. State verification and `storeTokens` → real
 * `encryptPII` run for real (PII_ENCRYPTION_KEY unset → cheap passthrough).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { SPOTIFY_OAUTH_SCOPES } from '@/lib/connectors/spotify/scopes';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  serverFetchMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
  captureWarningMock: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    SPOTIFY_CLIENT_ID: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' as string | undefined,
    SPOTIFY_CLIENT_SECRET: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3' as
      | string
      | undefined,
    SPOTIFY_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'test-oauth-state-secret' as string | undefined,
    CRON_SECRET: undefined as string | undefined,
    PII_ENCRYPTION_KEY: undefined as string | undefined,
    NODE_ENV: 'test',
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));
vi.mock('@/lib/db', () => ({
  db: { insert: hoisted.dbInsertMock, update: hoisted.dbUpdateMock },
}));
vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: hoisted.serverFetchMock,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
  captureWarning: hoisted.captureWarningMock,
}));
vi.mock('@/lib/env-server', () => ({
  env: hoisted.mockEnv,
  isTestEnv: () => true,
}));

import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';

const GET_ROUTE = () => import('@/app/api/connectors/spotify/callback/route');
const CONNECTORS = `http://localhost${APP_ROUTES.SETTINGS_CONNECTORS}`;

function trackInserts(returnIds: string[]) {
  const calls: Record<string, unknown>[] = [];
  let n = 0;
  hoisted.dbInsertMock.mockImplementation(() => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoUpdate: () => {
        calls.push(v);
        return {
          returning: () =>
            Promise.resolve([{ id: returnIds[n++] ?? `mock-id-${n}` }]),
        };
      },
    }),
  }));
  return calls;
}

/** `where()` must be a thenable that also exposes `.returning()`. */
function trackUpdates(returnRows: unknown[] = [{ id: 'updated' }]) {
  const calls: { set: Record<string, unknown> }[] = [];
  hoisted.dbUpdateMock.mockImplementation(() => ({
    set: (set: Record<string, unknown>) => ({
      where: () => {
        calls.push({ set });
        return Object.assign(Promise.resolve(undefined), {
          returning: () => Promise.resolve(returnRows),
        });
      },
    }),
  }));
  return calls;
}

const tokenResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    access_token: 'spotify-real-access-token',
    refresh_token: 'spotify-refresh-token',
    expires_in: 3600,
    token_type: 'Bearer',
    scope: SPOTIFY_OAUTH_SCOPES.join(' '),
    ...overrides,
  }),
});

function callbackRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/connectors/spotify/callback');
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return new Request(url.toString());
}

const signedState = (returnTo: string = APP_ROUTES.SETTINGS_CONNECTORS) =>
  signGoogleOAuthState({ userId: 'db-user-1', returnTo });
const profileOk = {
  ok: true,
  json: async () => ({ id: 'spotify-user-123', email: 'dj@example.com' }),
};
const validRequest = () =>
  callbackRequest({ code: 'auth-code-123', state: signedState() });

describe('GET /api/connectors/spotify/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockEnv.SPOTIFY_CLIENT_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    hoisted.mockEnv.SPOTIFY_CLIENT_SECRET = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3';
    hoisted.mockEnv.SPOTIFY_OAUTH_REDIRECT_URI_BASE = undefined;
    hoisted.mockEnv.TRACKING_TOKEN_SECRET = 'test-oauth-state-secret';
    hoisted.mockEnv.CRON_SECRET = undefined;
    hoisted.mockEnv.PII_ENCRYPTION_KEY = undefined;
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
  });

  it.each([
    [
      'provider reports an error',
      { error: 'access_denied', code: 'x', state: 'y' },
      'spotify_oauth_denied',
    ],
    ['code is absent', { state: 'some-state' }, 'spotify_oauth_missing'],
    ['state is absent', { code: 'some-code' }, 'spotify_oauth_missing'],
    [
      'session user differs from state user',
      { code: 'auth-code-123', state: signedState(), session: 'other-user' },
      'spotify_session_changed',
    ],
    [
      'Spotify credentials are missing',
      { code: 'auth-code-123', state: signedState(), noSecret: true },
      'spotify_not_configured',
    ],
  ])(
    'redirects to connectors settings when %s',
    async (_name, params, error) => {
      const { session, noSecret, ...query } = params as Record<
        string,
        string | boolean
      >;
      if (session)
        hoisted.getCachedAuthMock.mockResolvedValue({ userId: session });
      if (noSecret) hoisted.mockEnv.SPOTIFY_CLIENT_SECRET = undefined;
      const { GET } = await GET_ROUTE();
      const response = await GET(
        callbackRequest(query as Record<string, string>)
      );
      expect(response.headers.get('location')).toBe(
        `${CONNECTORS}?error=${error}`
      );
      expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
      expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
    }
  );

  it('rejects a tampered state signature without exchanging or writing', async () => {
    const state = signedState();
    const tampered = state.slice(0, -1) + (state.at(-1) === 'a' ? 'b' : 'a');
    const { GET } = await GET_ROUTE();
    const response = await GET(
      callbackRequest({ code: 'auth-code-123', state: tampered })
    );
    expect(response.headers.get('location')).toBe(
      `${CONNECTORS}?error=spotify_oauth_callback`
    );
    expect(hoisted.serverFetchMock).not.toHaveBeenCalled();
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify OAuth callback failed',
      expect.any(Error)
    );
  });

  it.each([
    [
      'token exchange fails',
      {
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant' }),
      },
      'spotify_token_exchange',
    ],
    [
      'token payload fails validation',
      { ok: true, status: 200, json: async () => ({ access_token: '' }) },
      'spotify_token_invalid',
    ],
    [
      'a required scope was not granted',
      tokenResponse({ scope: 'user-read-email user-read-private' }),
      'spotify_scopes',
    ],
  ])(
    'redirects to connectors settings when %s, writing no connector rows',
    async (_name, firstFetch, error) => {
      hoisted.serverFetchMock.mockResolvedValueOnce(firstFetch);
      const { GET } = await GET_ROUTE();
      const response = await GET(validRequest());
      expect(response.headers.get('location')).toBe(
        `${CONNECTORS}?error=${error}`
      );
      expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
    }
  );
  it('redirects with ?error=spotify_oauth_callback when the profile fetch fails, before any account row exists', async () => {
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce({ ok: false, status: 401 });
    const updates = trackUpdates();
    const { GET } = await GET_ROUTE();
    const response = await GET(validRequest());
    expect(response.headers.get('location')).toBe(
      `${CONNECTORS}?error=spotify_oauth_callback`
    );
    expect(hoisted.dbInsertMock).not.toHaveBeenCalled();
    // No accountId was minted, so no needs_reauth best-effort update runs.
    expect(updates).toHaveLength(0);
  });

  it('exchanges with Basic auth, upserts a connected row with capabilities, stores tokens, honors returnTo', async () => {
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(profileOk);
    const inserts = trackInserts(['spotify-acct-id']);
    trackUpdates();
    const { GET } = await GET_ROUTE();
    const response = await GET(
      callbackRequest({
        code: 'auth-code-123',
        state: signedState('/app/custom-return'),
      })
    );

    expect(hoisted.serverFetchMock).toHaveBeenNthCalledWith(
      1,
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4:f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3'
          ).toString('base64')}`,
        }),
      })
    );
    const exchangeBody = new URLSearchParams(
      (hoisted.serverFetchMock.mock.calls[0][1] as { body: string }).body
    );
    expect(exchangeBody.get('code')).toBe('auth-code-123');
    expect(exchangeBody.get('redirect_uri')).toBe(
      'http://localhost/api/connectors/spotify/callback'
    );
    expect(exchangeBody.get('grant_type')).toBe('authorization_code');

    expect(hoisted.serverFetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.spotify.com/v1/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer spotify-real-access-token' },
      })
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      userId: 'db-user-1',
      provider: 'spotify',
      providerAccountId: 'spotify-user-123',
      scopes: SPOTIFY_OAUTH_SCOPES,
      capabilities: {
        canRead: true,
        canPublishPlaylists: true,
        canUploadImages: true,
      },
    });
    expect(JSON.stringify(inserts[0].status)).toContain('connected');
    expect(response.headers.get('location')).toBe(
      'http://localhost/app/custom-return?connected=spotify'
    );
  });

  it('marks the connector needs_reauth when token persistence fails after the account row was written', async () => {
    hoisted.serverFetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(profileOk);
    trackInserts(['spotify-acct-id']);
    // storeTokens sees zero rows → throws → catch marks needs_reauth.
    const updates = trackUpdates([]);
    const { GET } = await GET_ROUTE();
    const response = await GET(validRequest());
    expect(response.headers.get('location')).toBe(
      `${CONNECTORS}?error=spotify_oauth_callback`
    );
    expect(updates).toHaveLength(2);
    expect(updates[1].set).toEqual(
      expect.objectContaining({ lastErrorCode: 'spotify_oauth_failed' })
    );
    expect(JSON.stringify(updates[1].set)).toContain('needs_reauth');
  });
});
