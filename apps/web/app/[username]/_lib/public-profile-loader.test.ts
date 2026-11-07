import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  select: vi.fn(),
  pixel: vi.fn(),
  authority: vi.fn(),
  cache: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ unstable_cache: mocks.cache }));
vi.mock('@/lib/services/profile', () => ({
  getProfileWithLinks: mocks.profile,
}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.error, warn: mocks.warn },
}));

import { getProfileAndLinks } from './public-profile-loader';

const profile = () => ({
  id: 'profile-1',
  userId: 'user-1',
  username: 'testartist',
  usernameNormalized: 'testartist',
  displayName: 'Test Artist',
  creatorType: 'artist',
  isPublic: true,
  isClaimed: true,
  avatarUrl: 'https://example.com/artist.jpg',
  userEmail: 'artist@gmail.com',
  userPlan: 'free',
  userIsPro: false,
  spotifyUrl: null,
  settings: {},
  theme: {},
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  socialLinks: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '');
  mocks.profile.mockResolvedValue(profile());
  mocks.cache.mockImplementation((fn: () => unknown) => fn);
  mocks.select.mockImplementation((columns: Record<string, unknown>) => ({
    from: () => ({
      where: () => ({
        limit: 'isPublic' in columns ? mocks.authority : mocks.pixel,
      }),
    }),
  }));
  mocks.pixel.mockResolvedValue([]);
  mocks.select.mockImplementation((columns: Record<string, unknown>) => {
    const limit = 'isPublic' in columns ? mocks.authority : mocks.pixel;
    const where = () => ({ limit });
    return { from: () => ({ where, leftJoin: () => ({ where }) }) };
  });
  mocks.authority.mockResolvedValue([{ id: 'profile-1', isPublic: true }]);
});
afterEach(() => vi.unstubAllEnvs());

describe('public profile loading boundaries', () => {
  it('rejects reserved handles before querying storage', async () => {
    expect(await getProfileAndLinks('ADMIN')).toMatchObject({
      status: 'not_found',
      profile: null,
      links: [],
    });
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it.each([null, { ...profile(), isPublic: false }])(
    'hides absent and private profiles',
    async value => {
      mocks.profile.mockResolvedValue(value);
      expect(await getProfileAndLinks('TestArtist')).toMatchObject({
        status: 'not_found',
        profile: null,
        contacts: [],
        creatorMetaPixelId: null,
      });
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it.each([
    'gp-mo9o4852+clerk_test@test.jovie.com',
    'qatest10+clerk_test@jovie.fm',
    'jovie.qa.test+clerk_test@gmail.com',
    'e2e@jov.ie',
  ])('404s test-account profile owned by %s', async userEmail => {
    mocks.profile.mockResolvedValue({
      ...profile(),
      usernameNormalized: 'tmo9o49ccvw8mlg',
      userEmail,
    });
    expect(await getProfileAndLinks('tmo9o49ccvw8mlg')).toMatchObject({
      status: 'not_found',
      profile: null,
    });
  });

  it('keeps exempt canary fixtures viewable by direct URL', async () => {
    mocks.profile.mockResolvedValue({
      ...profile(),
      usernameNormalized: 'browse-ready-user',
      userEmail: 'browse-ready+clerk_test@jov.ie',
    });
    expect(await getProfileAndLinks('browse-ready-user')).toMatchObject({
      status: 'ok',
    });
    mocks.profile.mockResolvedValue({
      ...profile(),
      userEmail: 'gp-abc+clerk_test@test.jovie.com',
      settings: { testProfileDirectUrlExempt: true },
    });
    expect(await getProfileAndLinks('testartist')).toMatchObject({
      status: 'ok',
    });
  });

  it('leaves a real profile unaffected', async () => {
    expect(await getProfileAndLinks('testartist')).toMatchObject({
      status: 'ok',
    });
  });

  it('normalizes handles and maps public data without the service no-store cache', async () => {
    mocks.profile.mockResolvedValue({
      ...profile(),
      userIsPro: true,
      userClerkId: 'identity-1',
      genres: ['folk'],
      socialLinks: [
        {
          id: 'social-1',
          platform: 'SPOTIFY',
          url: 'https://open.spotify.com/artist/1',
          createdAt: new Date('2026-01-01'),
          clicks: 4,
        },
      ],
      venmoHandle: '@artist tip',
      contacts: [{ id: 'contact-1' }],
      pressPhotos: [{ id: 'photo-1' }],
      latestRelease: { id: 'release-1' },
    });
    const result = await getProfileAndLinks('TestArtist');
    expect(mocks.profile).toHaveBeenCalledExactlyOnceWith('testartist', {
      skipCache: true,
      throwOnError: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      creatorIsPro: true,
      creatorClerkId: 'identity-1',
      genres: ['folk'],
      latestRelease: { id: 'release-1' },
      contacts: [{ id: 'contact-1' }],
      pressPhotos: [{ id: 'photo-1' }],
    });
    expect(result.profile).toMatchObject({
      id: 'profile-1',
      display_name: 'Test Artist',
      profile_completion_pct: 100,
      claim_token: null,
    });
    expect(result.links).toEqual([
      expect.objectContaining({
        platform: 'spotify',
        clicks: 4,
        created_at: '2026-01-01T00:00:00.000Z',
      }),
      expect.objectContaining({
        platform: 'venmo',
        url: 'https://venmo.com/artist%20tip',
      }),
    ]);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('does not duplicate an explicit Venmo link', async () => {
    mocks.profile.mockResolvedValue({
      ...profile(),
      venmoHandle: 'fallback',
      socialLinks: [
        {
          id: 'venmo',
          platform: 'venmo',
          url: 'https://venmo.com/canonical',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });
    const result = await getProfileAndLinks('testartist');
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      url: 'https://venmo.com/canonical',
      clicks: 0,
    });
  });

  it('distinguishes storage failure from a missing profile', async () => {
    const error = new Error('storage unavailable');
    mocks.profile.mockRejectedValue(error);
    expect(await getProfileAndLinks('testartist')).toMatchObject({
      status: 'error',
      profile: null,
      creatorMetaPixelId: null,
    });
    expect(mocks.error).toHaveBeenCalledWith(
      'Error fetching creator profile',
      expect.objectContaining({ error }),
      'public-profile'
    );
  });

  it('reads trimmed Meta pixels only for entitled creators and fails closed on lookup failure', async () => {
    mocks.profile.mockResolvedValue({ ...profile(), userPlan: 'pro' });
    mocks.pixel
      .mockResolvedValueOnce([{ facebookPixelId: ' 12345 ' }])
      .mockRejectedValueOnce(new Error('pixel storage unavailable'));
    expect((await getProfileAndLinks('testartist')).creatorMetaPixelId).toBe(
      '12345'
    );
    const result = await getProfileAndLinks('testartist');
    expect(result).toMatchObject({ status: 'ok', creatorMetaPixelId: null });
    expect(mocks.warn).toHaveBeenCalled();
  });
});

describe('per-request public authority', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

  it('caches only the body, per handle, under the profile invalidation tags', async () => {
    expect((await getProfileAndLinks('TestArtist')).status).toBe('ok');
    expect(mocks.cache).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      ['public-profile-body', 'testartist'],
      expect.objectContaining({
        tags: expect.arrayContaining(['profiles-all']),
        revalidate: 3600,
      })
    );
    expect(mocks.authority).toHaveBeenCalledTimes(1);
  });

  it.each([[[]], [new Error('temporary failure')]])(
    'rechecks after a missing or temporarily unavailable authority read',
    async value => {
      if (value instanceof Error) mocks.authority.mockRejectedValueOnce(value);
      else mocks.authority.mockResolvedValueOnce(value);
      expect((await getProfileAndLinks('testartist')).status).toBe(
        value instanceof Error ? 'error' : 'not_found'
      );
      expect((await getProfileAndLinks('testartist')).status).toBe('ok');
      expect(mocks.authority).toHaveBeenCalledTimes(2);
    }
  );

  it('reads current storage when the shared cache is unavailable', async () => {
    mocks.cache.mockImplementation(() => async () => {
      throw new Error('cache unavailable');
    });
    expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });

  it('bypasses the production cache for the explicit QA path', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.authority).not.toHaveBeenCalled();
  });
});

describe('fresh public authority after a warm response', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    const retained = new Map<string, unknown>();
    mocks.cache.mockImplementation(
      (fn: () => Promise<unknown>, keys: string[]) => async () => {
        const key = JSON.stringify(keys);
        if (!retained.has(key)) retained.set(key, await fn());
        return retained.get(key);
      }
    );
  });

  it('serves the warm body without re-reading it while publication holds', async () => {
    expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    expect(mocks.profile).toHaveBeenCalledTimes(1);
    expect(mocks.authority).toHaveBeenCalledTimes(2);
  });

  it('reads plan, ownership and pixel fresh instead of from the cached body', async () => {
    expect((await getProfileAndLinks('testartist')).creatorIsPro).toBe(false);
    mocks.authority.mockResolvedValueOnce([
      {
        id: 'profile-1',
        isPublic: true,
        isClaimed: true,
        userIsPro: true,
        userClerkId: 'identity-9',
        userPlan: 'pro',
      },
    ]);
    mocks.pixel.mockResolvedValueOnce([{ facebookPixelId: '999' }]);
    const upgraded = await getProfileAndLinks('testartist');
    expect(upgraded).toMatchObject({
      status: 'ok',
      creatorIsPro: true,
      creatorClerkId: 'identity-9',
      creatorMetaPixelId: '999',
    });
    expect(upgraded.profile?.is_claimed).toBe(true);
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });

  it.each([false, null])(
    'does not let a cached success authorize a revoked profile (%s)',
    async isPublic => {
      expect((await getProfileAndLinks('testartist')).status).toBe('ok');
      mocks.authority.mockResolvedValueOnce([{ id: 'profile-1', isPublic }]);
      expect(await getProfileAndLinks('testartist')).toMatchObject({
        status: 'not_found',
        profile: null,
        links: [],
        contacts: [],
      });
    }
  );

  it('fails closed after a warm success when the authoritative storage read fails', async () => {
    expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    mocks.authority.mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await getProfileAndLinks('testartist')).toMatchObject({
      status: 'error',
      profile: null,
      links: [],
      contacts: [],
    });
  });

  it('does not resurrect an old handle after a rename without invalidation', async () => {
    expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    mocks.authority.mockResolvedValueOnce([]);
    expect(await getProfileAndLinks('testartist')).toMatchObject({
      status: 'not_found',
      profile: null,
    });
  });

  it('never serves a cached body for a handle now owned by another profile', async () => {
    expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    mocks.authority.mockResolvedValueOnce([
      { id: 'profile-2', isPublic: true },
    ]);
    mocks.profile.mockResolvedValueOnce({ ...profile(), id: 'profile-2' });
    const result = await getProfileAndLinks('testartist');
    expect(result.profile?.id).toBe('profile-2');
    expect(mocks.profile).toHaveBeenCalledTimes(2);
  });

  it.each(['false', 'f', 2, [], {}])(
    'does not treat malformed publication %j as a public grant',
    async isPublic => {
      mocks.authority.mockResolvedValue([{ id: 'profile-1', isPublic }]);
      expect(await getProfileAndLinks('testartist')).toMatchObject({
        status: 'not_found',
        profile: null,
      });
    }
  );
});
