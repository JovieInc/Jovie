import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from '@/lib/connectors/google-calendar/oauth-state';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';

const profileId = '22222222-2222-4222-8222-222222222222';
const scopes = YOUTUBE_OAUTH_SCOPES.join(' ');
const authorizePath = '/api/connectors/youtube/authorize';
const callbackPath = '/api/connectors/youtube/callback';
const disconnectPath = '/api/connectors/youtube/disconnect';
const syncPath = '/api/youtube-library/sync';
type Row = Record<'id' | 'channelId' | 'providerAccountId', string> & {
  creatorProfileId?: string;
  status?: string;
  scopes: string[];
};

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  fetch: vi.fn(),
  channels: vi.fn(),
  store: vi.fn(),
  loadToken: vi.fn(),
  lock: vi.fn(),
  sync: vi.fn(),
  env: {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id' as string | undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret' as string | undefined,
    YOUTUBE_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'state-secret',
  },
  rows: [] as Row[],
  writes: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.access,
}));
vi.mock('@/lib/connectors/token-vault', () => ({
  loadDecryptedToken: mocks.loadToken,
  storeTokens: mocks.store,
  withRefreshLock: mocks.lock,
}));
vi.mock('@/lib/connectors/youtube/provider', async () => ({
  ...(await vi.importActual('@/lib/connectors/youtube/provider')),
  createYouTubeLibraryProvider: vi.fn(),
  listOwnedYouTubeChannels: mocks.channels,
}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: mocks.fetch }));
vi.mock('@/lib/youtube-library/sync', () => ({
  syncChannelVideos: mocks.sync,
}));

import { GET as authorize } from '@/app/api/connectors/youtube/authorize/route';
import { GET as callback } from '@/app/api/connectors/youtube/callback/route';
import { POST as disconnect } from '@/app/api/connectors/youtube/disconnect/route';
import { POST as sync } from '@/app/api/youtube-library/sync/route';
import { YouTubeProviderError } from '@/lib/connectors/youtube/provider';

const tokenResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    access_token: 'secret-access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    scope: scopes,
    ...overrides,
  }),
});
const getRequest = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return new Request(url);
};
const postRequest = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
const statePayload = { userId: 'user-1', creatorProfileId: profileId };
const state = (returnTo = '/app/library') =>
  signGoogleOAuthState({ ...statePayload, returnTo });
const defaultRow: Row = {
  id: 'account-1',
  channelId: 'channel-1',
  providerAccountId: 'channel-1',
  creatorProfileId: profileId,
  status: 'connected',
  scopes: [...YOUTUBE_OAUTH_SCOPES],
};
type Route = (request: Request) => Promise<Response>;
const location = (
  route: Route,
  path: string,
  params: Record<string, string> = {}
) =>
  route(getRequest(path, params)).then(
    response => response.headers.get('location') ?? ''
  );
const postStatus = (route: Route, path: string) =>
  route(postRequest(path, { creatorProfileId: profileId })).then(
    response => response.status
  );
const expectCallbackError = (expected: string, stateParam = state()) =>
  location(callback, paths.callback, {
    code: 'code',
    state: stateParam,
  }).then(value => expect(value).toContain(expected));

function configureDb() {
  mocks.db.insert.mockReturnValue({
    values: (values: Record<string, unknown>) => ({
      onConflictDoUpdate: (conflict: unknown) => {
        mocks.inserts.push(values);
        return { returning: async () => [{ id: 'account-1' }] };
      },
    }),
  });
  const selection = Object.assign(Promise.resolve(mocks.rows), {
    limit: async () => mocks.rows,
  });
  mocks.db.select.mockReturnValue({ from: () => ({ where: () => selection }) });
  mocks.db.update.mockReturnValue({
    set: (values: Record<string, unknown>) => ({
      where: async () => mocks.writes.push(values),
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.writes.length = mocks.inserts.length = 0;
  mocks.rows.splice(0, mocks.rows.length, { ...defaultRow });
  mocks.auth.mockResolvedValue({ userId: 'user-1' });
  mocks.access.mockResolvedValue({ ok: true });
  mocks.fetch.mockResolvedValue(tokenResponse());
  mocks.channels.mockResolvedValue([
    { id: 'channel-1', title: 'Artist', uploadsPlaylistId: 'uploads-1' },
  ]);
  mocks.loadToken.mockResolvedValue({
    accessToken: 'cached',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  mocks.lock.mockImplementation(async (_, fn) => fn());
  mocks.sync.mockResolvedValue({ total: 2, inserted: 1 });
  configureDb();
});

async function fail(error: Error, devMessage?: string, reauth = false) {
  mocks.sync.mockRejectedValueOnce(error);
  expect(await postStatus(sync, paths.sync)).toBe(502);
  const write = mocks.writes.at(-1);
  expect(write?.lastErrorCode).toBe(
    reauth ? 'youtube_reauth_required' : 'youtube_sync_failed'
  );
  if (devMessage) expect(write?.lastErrorDevMessage).toBe(devMessage);
  if (reauth) {
    expect(write).toMatchObject({
      status: expect.anything(),
      lastErrorUserMessage: 'Reconnect YouTube to refresh access.',
    });
  }
}

const expectOAuthFailure = (reauth = false) => {
  const write = mocks.writes.at(-1);
  expect(write?.lastErrorCode).toBe('youtube_oauth_failed');
  if (reauth) expect(write?.status).toBeDefined();
};

describe('YouTube connector routes', () => {
  it('authorizes an exact profile and preserves safe OAuth state/scopes', async () => {
    mocks.access.mockResolvedValueOnce({ ok: false });
    expect(
      await location(authorize, paths.authorize, {
        creatorProfileId: profileId,
      })
    ).toContain('youtube_profile_access');
    const response = await authorize(
      getRequest(paths.authorize, {
        creatorProfileId: profileId,
        returnTo: '//evil.example',
      })
    );
    const authUrl = new URL(response.headers.get('location') as string);
    expect(authUrl.searchParams.get('scope')?.split(' ')).toEqual(
      YOUTUBE_OAUTH_SCOPES
    );
    expect(
      verifyGoogleOAuthState(authUrl.searchParams.get('state') as string)
    ).toMatchObject({
      userId: 'user-1',
      creatorProfileId: profileId,
      returnTo: '/app/library',
    });
  });

  it('rejects callback tampering, incomplete grants, and identity conflicts', async () => {
    const signed = state();
    await expectCallbackError(
      'youtube_oauth_callback',
      `${signed.slice(0, -1)}a`
    );
    mocks.auth.mockResolvedValueOnce({ userId: 'other-user' });
    await expectCallbackError('youtube_session_changed', signed);
    mocks.fetch.mockResolvedValueOnce(
      tokenResponse({ scope: YOUTUBE_OAUTH_SCOPES[0] })
    );
    await expectCallbackError('youtube_scopes', signed);
    mocks.rows[0].creatorProfileId = 'other-profile';
    await expectCallbackError('youtube_channel_profile_conflict');
    Object.assign(mocks.rows[0], {
      creatorProfileId: profileId,
      providerAccountId: 'other-channel',
    });
    await expectCallbackError('youtube_profile_channel_conflict');
  });

  it('idempotently upserts one owned channel, stores vault input, and fails closed on persistence errors', async () => {
    expect(
      await location(callback, paths.callback, {
        code: 'auth-code',
        state: state('/app/library?stage=all'),
      })
    ).toBe('http://localhost/app/library?stage=all&connected=youtube');
    expect(mocks.inserts[0]).toMatchObject({
      creatorProfileId: profileId,
      providerAccountId: 'channel-1',
    });
    expect(mocks.store).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorAccountId: 'account-1',
        accessToken: 'secret-access-token',
      })
    );
    mocks.store.mockRejectedValueOnce(new Error('secret-access-token leaked'));
    await expectCallbackError('youtube_oauth_callback');
    expectOAuthFailure();
  });

  it('preserves refresh tokens on reconnect and reauths a first grant without one', async () => {
    mocks.fetch.mockResolvedValueOnce(
      tokenResponse({ refresh_token: undefined })
    );
    await expectCallbackError('connected=youtube');
    expect(mocks.store).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshToken: 'refresh-token' })
    );
    mocks.loadToken.mockResolvedValueOnce(null);
    mocks.fetch.mockResolvedValueOnce(
      tokenResponse({ refresh_token: undefined })
    );
    await expectCallbackError('youtube_oauth_callback');
    expect(mocks.store).toHaveBeenCalledTimes(1);
    expectOAuthFailure(true);
  });

  it('disconnects only an authorized profile and is idempotent', async () => {
    expect(await postStatus(disconnect, paths.disconnect)).toBe(200);
    expect(await postStatus(disconnect, paths.disconnect)).toBe(200);
    expect(mocks.db.update).toHaveBeenCalledTimes(2);
    expect(mocks.writes[0]).toMatchObject({
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    });
  });

  it('requires one current account and fresh vault tokens, then classifies provider failures', async () => {
    const post = () => postStatus(sync, paths.sync);
    const runSync = () =>
      sync(postRequest(paths.sync, { creatorProfileId: profileId }));
    mocks.rows[0].scopes = [YOUTUBE_OAUTH_SCOPES[0]];
    expect(await post()).toBe(409);
    mocks.rows[0].scopes = [...YOUTUBE_OAUTH_SCOPES];
    mocks.rows.push({
      ...mocks.rows[0],
      id: 'account-2',
      providerAccountId: 'channel-2',
    });
    expect(await post()).toBe(409);
    mocks.rows.pop();
    mocks.loadToken.mockRejectedValueOnce(new Error('refresh failed'));
    await fail(new Error('refresh failed'), 'refresh failed');
    const expired = {
      accessToken: 'expired',
      refreshToken: 'refresh-token',
      expiresAt: new Date(0),
    };
    mocks.loadToken.mockResolvedValue(expired);
    const success = await runSync();
    expect(success.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        channelId: 'channel-1',
        now: expect.any(Date),
      })
    );
    await fail(
      new Error('cached provider detail'),
      '[REDACTED] provider detail'
    );
    for (const [status, message] of [
      [401, 'expired'],
      [403, 'The authorized account does not own the selected YouTube channel'],
    ] as const) {
      await fail(new YouTubeProviderError(message, status), undefined, true);
    }
    await fail(new YouTubeProviderError('upstream', 403));
    expect(mocks.writes.at(-1)).not.toHaveProperty('status');
  });
});
