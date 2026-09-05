import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from '@/lib/connectors/google-calendar/oauth-state';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';

const profileId = '22222222-2222-4222-8222-222222222222';
const scopes = YOUTUBE_OAUTH_SCOPES.join(' ');
const paths = {
  authorize: '/api/connectors/youtube/authorize',
  callback: '/api/connectors/youtube/callback',
  disconnect: '/api/connectors/youtube/disconnect',
  sync: '/api/youtube-library/sync',
};

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  fetch: vi.fn(),
  channels: vi.fn(),
  store: vi.fn(),
  loadToken: vi.fn(),
  lock: vi.fn(),
  RefreshLockBusyError: class RefreshLockBusyError extends Error {
    readonly connectorAccountId: string;

    constructor(connectorAccountId: string) {
      super(
        `Token refresh lock is held by another caller for account ${connectorAccountId}`
      );
      this.name = 'RefreshLockBusyError';
      this.connectorAccountId = connectorAccountId;
    }
  },
  sync: vi.fn(),
  capture: vi.fn(),
  env: {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id' as string | undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret' as string | undefined,
    YOUTUBE_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'state-secret',
  },
  rows: [] as { id: string; channelId: string; scopes: string[] }[],
  writes: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  conflicts: [] as unknown[],
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
  RefreshLockBusyError: mocks.RefreshLockBusyError,
}));
vi.mock('@/lib/connectors/youtube/provider', () => ({
  createYouTubeLibraryProvider: vi.fn(),
  listOwnedYouTubeChannels: mocks.channels,
}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: mocks.fetch }));
vi.mock('@/lib/youtube-library/sync', () => ({
  syncChannelVideos: mocks.sync,
}));
vi.mock('@/lib/library/graph-store', () => ({
  reconcileApprovedYouTubeCollaborators: vi.fn().mockResolvedValue(0),
}));

import { GET as authorize } from '@/app/api/connectors/youtube/authorize/route';
import { GET as callback } from '@/app/api/connectors/youtube/callback/route';
import { POST as disconnect } from '@/app/api/connectors/youtube/disconnect/route';
import { POST as sync } from '@/app/api/youtube-library/sync/route';

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'secret-access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      scope: scopes,
      ...overrides,
    }),
  };
}

function getRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  return new Request(url);
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function state(returnTo = '/app/library') {
  return signGoogleOAuthState({
    userId: 'user-1',
    creatorProfileId: profileId,
    returnTo,
  });
}

type Route = (request: Request) => Promise<Response>;

async function location(
  route: Route,
  path: string,
  params: Record<string, string> = {}
) {
  return (await route(getRequest(path, params))).headers.get('location') ?? '';
}

async function status(route: Route, path: string, body: unknown) {
  return (await route(postRequest(path, body))).status;
}

const authLocation = (params: Record<string, string> = {}) =>
  location(authorize, paths.authorize, params);
const callbackLocation = (params: Record<string, string> = {}) =>
  location(callback, paths.callback, params);
const postStatus = (route: Route, path: string, body: unknown) =>
  status(route, path, body);

function configureDb() {
  mocks.db.insert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoUpdate: (conflict: unknown) => {
        mocks.inserts.push(values);
        mocks.conflicts.push(conflict);
        return { returning: async () => [{ id: 'account-1' }] };
      },
    }),
  }));
  mocks.db.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => mocks.rows }) }),
  });
  mocks.db.update.mockImplementation(() => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => mocks.writes.push(values),
    }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rows.splice(0, 1, {
    id: 'account-1',
    channelId: 'channel-1',
    scopes: [...YOUTUBE_OAUTH_SCOPES],
  });
  mocks.writes.splice(0);
  mocks.inserts.splice(0);
  mocks.conflicts.splice(0);
  Object.assign(mocks.env, {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    YOUTUBE_OAUTH_REDIRECT_URI_BASE: undefined,
  });
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
  mocks.lock.mockImplementation(
    async (_id: string, fn: () => Promise<unknown>) => fn()
  );
  mocks.sync.mockResolvedValue({ total: 2, inserted: 1 });
  mocks.capture.mockResolvedValue(undefined);
  configureDb();
});

describe('YouTube connector routes', () => {
  it('authorizes an exact profile and preserves safe OAuth state/scopes', async () => {
    mocks.access.mockResolvedValueOnce({ ok: false });
    expect(await authLocation({ creatorProfileId: profileId })).toContain(
      'youtube_profile_access'
    );
    const response = await authorize(
      getRequest(paths.authorize, {
        creatorProfileId: profileId,
        returnTo: '//evil.example',
      })
    );
    const authUrl = new URL(response.headers.get('location') as string);
    expect(authUrl.searchParams.get('scope')?.split(' ')).toEqual([
      ...YOUTUBE_OAUTH_SCOPES,
    ]);
    expect(
      verifyGoogleOAuthState(authUrl.searchParams.get('state') as string)
    ).toMatchObject({
      userId: 'user-1',
      creatorProfileId: profileId,
      returnTo: '/app/library',
    });
  });

  it('rejects callback tampering, incomplete grants, and ambiguous ownership before writes', async () => {
    const signed = state();
    expect(
      await callbackLocation({ code: 'code', state: `${signed.slice(0, -1)}a` })
    ).toContain('youtube_oauth_callback');
    mocks.auth.mockResolvedValueOnce({ userId: 'other-user' });
    expect(await callbackLocation({ code: 'code', state: signed })).toContain(
      'youtube_session_changed'
    );
    mocks.fetch.mockResolvedValueOnce(
      tokenResponse({ scope: YOUTUBE_OAUTH_SCOPES[0] })
    );
    expect(await callbackLocation({ code: 'code', state: signed })).toContain(
      'youtube_scopes'
    );
  });

  it('rejects cross-profile channel reassignment before upsert', async () => {
    mocks.db.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              creatorProfileId: '33333333-3333-4333-8333-333333333333',
              status: 'needs_reauth',
            },
          ],
        }),
      }),
    });

    expect(
      await callbackLocation({ code: 'auth-code', state: state() })
    ).toContain('youtube_channel_already_connected');
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('idempotently upserts one owned channel, stores vault input, and fails closed on persistence errors', async () => {
    expect(
      await callbackLocation({
        code: 'auth-code',
        state: state('/app/library?stage=all'),
      })
    ).toBe('http://localhost/app/library?stage=all&connected=youtube');
    expect(mocks.inserts[0]).toMatchObject({
      creatorProfileId: profileId,
      providerAccountId: 'channel-1',
    });
    expect(mocks.conflicts[0]).toMatchObject({
      target: expect.any(Array),
      set: expect.objectContaining({ creatorProfileId: profileId }),
    });
    expect(mocks.store).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorAccountId: 'account-1',
        accessToken: 'secret-access-token',
      })
    );
    mocks.store.mockRejectedValueOnce(new Error('secret-access-token leaked'));
    expect(
      await callbackLocation({ code: 'auth-code', state: state() })
    ).toContain('youtube_oauth_callback');
    expect(mocks.writes.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_oauth_failed',
    });
  });

  it('disconnects only an authorized profile and is idempotent', async () => {
    const first = await postStatus(disconnect, paths.disconnect, {
      creatorProfileId: profileId,
    });
    const second = await postStatus(disconnect, paths.disconnect, {
      creatorProfileId: profileId,
    });
    expect([first, second]).toEqual([200, 200]);
    expect(mocks.db.update).toHaveBeenCalledTimes(2);
    expect(mocks.writes[0]).toMatchObject({
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    });
  });

  it('manual sync preserves success when last-sync metadata persistence fails', async () => {
    mocks.db.update.mockImplementationOnce(() => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          mocks.writes.push(values);
          throw new Error('last sync metadata failed');
        },
      }),
    }));

    const response = await sync(
      postRequest(paths.sync, { creatorProfileId: profileId })
    );

    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        channelId: 'channel-1',
      })
    );
    expect(mocks.writes.at(-1)).toMatchObject({ lastSyncAt: expect.any(Date) });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('manual sync requires current scopes/fresh vault tokens and records safe outcomes', async () => {
    mocks.rows.splice(0, 1, {
      id: 'account-1',
      channelId: 'channel-1',
      scopes: [YOUTUBE_OAUTH_SCOPES[0]],
    });
    expect(
      await postStatus(sync, paths.sync, { creatorProfileId: profileId })
    ).toBe(409);
    mocks.rows[0].scopes = [...YOUTUBE_OAUTH_SCOPES];
    mocks.loadToken.mockRejectedValueOnce(
      new mocks.RefreshLockBusyError('account-1')
    );
    const busy = await sync(
      postRequest(paths.sync, { creatorProfileId: profileId })
    );
    expect(busy.status).toBe(503);
    expect(busy.headers.get('retry-after')).toBe('5');
    expect(mocks.writes).toHaveLength(0);
    expect(mocks.capture).not.toHaveBeenCalled();
    mocks.loadToken.mockRejectedValueOnce(new Error('refresh failed'));
    expect(
      await postStatus(sync, paths.sync, { creatorProfileId: profileId })
    ).toBe(502);
    expect(mocks.writes.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_sync_failed',
      lastErrorDevMessage: 'refresh failed',
    });
    const expired = {
      accessToken: 'expired',
      refreshToken: 'refresh-token',
      expiresAt: new Date(0),
    };
    mocks.loadToken
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(expired);
    const success = await sync(
      postRequest(paths.sync, { creatorProfileId: profileId })
    );
    expect(success.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        channelId: 'channel-1',
        now: expect.any(Date),
      })
    );
    mocks.sync.mockRejectedValueOnce(new Error('cached provider detail'));
    const failed = await sync(
      postRequest(paths.sync, { creatorProfileId: profileId })
    );
    expect(failed.status).toBe(502);
    expect(mocks.writes.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_sync_failed',
      lastErrorDevMessage: '[REDACTED] provider detail',
    });
  });
});
