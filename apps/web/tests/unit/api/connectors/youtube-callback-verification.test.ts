/**
 * GET /api/connectors/youtube/callback — candidate verification. Only db,
 * auth, the token vault, the provider channel lookup, and fetch are mocked.
 * Ownership comes solely from the OAuth `channels?mine=true` result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';

const CANDIDATE = 'UCabcdefghijklmnopqrstuv';
const OTHER = 'UCotherchannel0000000000';

const hoisted = vi.hoisted(() => ({
  listOwned: vi.fn(),
  selectRows: vi.fn(),
  serverFetch: vi.fn(),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  mockEnv: {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id' as string | undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret' as string | undefined,
    YOUTUBE_OAUTH_REDIRECT_URI_BASE: undefined as string | undefined,
    TRACKING_TOKEN_SECRET: 'test-oauth-state-secret' as string | undefined,
    NODE_ENV: 'test',
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn().mockResolvedValue({ userId: 'user-1' }),
}));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/connectors/token-vault', () => ({
  storeTokens: hoisted.storeTokens,
}));
vi.mock('@/lib/connectors/youtube/provider', () => ({
  listOwnedYouTubeChannels: hoisted.listOwned,
}));
vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: hoisted.serverFetch,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/env-server', () => ({
  env: hoisted.mockEnv,
  isTestEnv: () => true,
}));
vi.mock('@/lib/db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = () => Promise.resolve(hoisted.selectRows());
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([{ id: 'acct-1' }]),
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';

const PROFILE_ID = '3a53ba3e-150c-4ab5-8e73-2d2499764e2c';

function request() {
  const url = new URL('http://localhost/api/connectors/youtube/callback');
  url.searchParams.set('code', 'auth-code');
  url.searchParams.set(
    'state',
    signGoogleOAuthState({
      userId: 'user-1',
      creatorProfileId: PROFILE_ID,
      returnTo: '/app/dashboard/profile',
    })
  );
  return new Request(url.toString());
}

function owned(...ids: string[]) {
  hoisted.listOwned.mockResolvedValue(
    ids.map(id => ({ id, title: `Channel ${id}`, uploadsPlaylistId: 'UU1' }))
  );
}

/** Select order: profile settings, then "linked to another profile". */
function profileSettings(hasCandidate: boolean) {
  hoisted.selectRows
    .mockReturnValueOnce([
      {
        settings: hasCandidate
          ? {
              onboarding: {
                youtubeCandidate: {
                  channelId: CANDIDATE,
                  title: 'Lena Hart',
                  url: `https://www.youtube.com/channel/${CANDIDATE}`,
                  cadenceQualified: true,
                },
              },
            }
          : {},
      },
    ])
    .mockReturnValueOnce([]);
}

describe('GET /api/connectors/youtube/callback candidate verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectRows.mockReset();
    hoisted.listOwned.mockReset();
    hoisted.serverFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
        scope: YOUTUBE_OAUTH_SCOPES.join(' '),
      }),
    });
  });

  async function run() {
    const { GET } = await import('@/app/api/connectors/youtube/callback/route');
    const res = await GET(request());
    return new URL(res.headers.get('location') ?? '');
  }

  it('reports verified when OAuth returns the candidate channel id', async () => {
    profileSettings(true);
    owned(CANDIDATE);
    const location = await run();
    expect(location.searchParams.get('connected')).toBe('youtube');
    expect(location.searchParams.get('youtube_verification')).toBe('verified');
  });

  it('keeps the candidate unverified when the account owns a different channel', async () => {
    profileSettings(true);
    owned(OTHER);
    const location = await run();
    expect(location.searchParams.get('youtube_verification')).toBe('mismatch');
  });

  it('uses the candidate to disambiguate several owned channels', async () => {
    profileSettings(true);
    owned(OTHER, CANDIDATE);
    const location = await run();
    expect(location.searchParams.get('youtube_verification')).toBe('verified');
  });

  it('refuses to guess among several channels when none match the candidate', async () => {
    profileSettings(true);
    owned(OTHER, 'UCanother00000000000000');
    const location = await run();
    expect(location.searchParams.get('error')).toBe('youtube_channel_choice');
    expect(location.searchParams.get('youtube_verification')).toBeNull();
  });

  it('fails closed (no verification, no connection) when the provider lookup fails', async () => {
    profileSettings(true);
    hoisted.listOwned.mockRejectedValue(new Error('403 quota'));
    const location = await run();
    expect(location.searchParams.get('error')).toBe('youtube_oauth_callback');
    expect(location.searchParams.get('youtube_verification')).toBeNull();
    expect(hoisted.storeTokens).not.toHaveBeenCalled();
  });

  it('adds no verification result when the profile has no candidate', async () => {
    profileSettings(false);
    owned(CANDIDATE);
    const location = await run();
    expect(location.searchParams.get('connected')).toBe('youtube');
    expect(location.searchParams.get('youtube_verification')).toBeNull();
  });
});
