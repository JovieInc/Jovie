import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_USER_ID = '88888888-8888-4888-8888-888888888888';
const { eqMock, insertValues, cols } = vi.hoisted(() => ({
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  insertValues: vi.fn(() => ({
    onConflictDoUpdate: vi.fn(async () => undefined),
  })),
  cols: (prefix: string) =>
    new Proxy({}, { get: (_target, key) => `${prefix}.${String(key)}` }),
}));

vi.mock('drizzle-orm', () => ({ eq: eqMock }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: APP_USER_ID })),
}));
vi.mock('@/lib/pre-save/spotify', () => ({
  exchangeSpotifyCode: vi.fn(async () => ({
    access_token: 'access',
    refresh_token: 'refresh',
  })),
  fetchSpotifyMe: vi.fn(async () => ({
    id: 'spotify-user',
    email: 'fan@example.com',
  })),
}));
vi.mock('@/lib/pre-save/state', () => ({
  decodeSpotifyPreSaveState: () => ({
    releaseId: '99999999-9999-4999-8999-999999999999',
    trackId: null,
    username: 'artist',
    slug: 'single',
  }),
}));
vi.mock('@/lib/utils/pii-encryption', () => ({
  encryptPII: (value: string) => `enc:${value}`,
}));
vi.mock('@/lib/db/schema/auth', () => ({ users: cols('users') }));
vi.mock('@/lib/db/schema/pre-save', () => ({
  preSaveTokens: cols('preSaveTokens'),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ id: APP_USER_ID }] }),
      }),
    }),
    insert: () => ({ values: insertValues }),
  },
}));

describe('GET /api/pre-save/spotify/callback app user id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links the Spotify account to users.id when clerk_id is null', async () => {
    const { GET } = await import('@/app/api/pre-save/spotify/callback/route');
    const response = await GET(
      new Request(
        'http://localhost/api/pre-save/spotify/callback?code=auth-code&state=signed'
      )
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(
      'preSave=spotify-success'
    );
    expect(eqMock).toHaveBeenCalledWith('users.id', APP_USER_ID);
    expect(eqMock).not.toHaveBeenCalledWith('users.clerkId', expect.anything());
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: APP_USER_ID })
    );
  });
});
