import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  select: vi.fn(),
  pixel: vi.fn(),
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
  userEmail: 'artist@example.com',
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
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: mocks.pixel }) }),
  });
  mocks.pixel.mockResolvedValue([]);
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

describe('ISR cache recovery', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

  it('uses the profile invalidation tag and a one-hour success TTL', async () => {
    expect((await getProfileAndLinks('TestArtist')).status).toBe('ok');
    expect(mocks.cache).toHaveBeenCalledWith(
      expect.any(Function),
      ['public-profile-testartist'],
      { tags: ['profiles-all', 'profile:testartist'], revalidate: 3600 }
    );
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });

  it.each([null, new Error('temporary failure')])(
    'never stores a negative result or rereads it within one request',
    async value => {
      let rejected: unknown;
      mocks.cache.mockImplementation(
        (fn: () => Promise<unknown>) => async () => {
          try {
            return await fn();
          } catch (error) {
            rejected = error;
            throw error;
          }
        }
      );
      if (value instanceof Error) mocks.profile.mockRejectedValueOnce(value);
      else mocks.profile.mockResolvedValueOnce(value);
      expect((await getProfileAndLinks('testartist')).status).toBe(
        value instanceof Error ? 'error' : 'not_found'
      );
      expect(rejected).toBeInstanceOf(Error);
      expect(mocks.profile).toHaveBeenCalledTimes(1);
      expect((await getProfileAndLinks('testartist')).status).toBe('ok');
    }
  );

  it('recovers from cache infrastructure failure by fetching storage once', async () => {
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
  });
});
