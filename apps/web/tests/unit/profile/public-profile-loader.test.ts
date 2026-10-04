/**
 * Behavior tests for the public profile loader (JOV-5778).
 *
 * Executes the real `app/[username]/_lib/public-profile-loader.ts`:
 * - reserved-handle short-circuit returns not_found without touching storage
 * - ok results map profile/links/contacts and inject venmo tipping links
 * - non-public profiles resolve to not_found
 * - storage failures resolve to error (never throw into the RSC render)
 * - the unstable_cache layer is bypassed under NODE_ENV=test / QA smoke
 *
 * Related surface: public-profile-isr (docs/TEST_RISK_REGISTER.md, 75% target).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileWithLinks } from '@/lib/services/profile';

const {
  getProfileWithLinksMock,
  unstableCacheMock,
  checkBooleanMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getProfileWithLinksMock: vi.fn(),
  unstableCacheMock: vi.fn(),
  checkBooleanMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  // unstable_cache wraps the fetcher; run it immediately and record the call
  // so cache-key/tag/TTL assertions can inspect the real configuration.
  unstable_cache: vi.fn(
    (fetcher: () => Promise<unknown>, keyParts: string[], options: unknown) => {
      unstableCacheMock(keyParts, options);
      return () => fetcher();
    }
  ),
}));

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('@/lib/entitlements/registry', () => ({
  checkBoolean: (...args: unknown[]) => checkBooleanMock(...args),
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileWithLinks: (...args: unknown[]) => getProfileWithLinksMock(...args),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
  },
}));

// jsdom-safe performance.now for the cache wrapper
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() } as never;
}

const CREATED_AT = new Date('2026-01-15T12:00:00.000Z');

function buildProfileWithLinks(
  overrides: Partial<ProfileWithLinks> = {}
): ProfileWithLinks {
  return {
    id: 'profile-1',
    userId: 'user-1',
    creatorType: 'artist',
    username: 'testartist',
    usernameNormalized: 'testartist',
    displayName: 'Test Artist',
    bio: 'A bio',
    careerHighlights: null,
    avatarUrl: 'https://example.com/avatar.jpg',
    spotifyUrl: 'https://open.spotify.com/artist/123',
    appleMusicUrl: null,
    youtubeUrl: null,
    spotifyId: 'spotify-123',
    appleMusicId: null,
    youtubeMusicId: null,
    deezerId: null,
    tidalId: null,
    soundcloudId: null,
    musicbrainzId: null,
    isPublic: true,
    isVerified: false,
    isClaimed: true,
    claimToken: null,
    isFeatured: false,
    marketingOptOut: false,
    settings: {},
    theme: {},
    profileViews: 12,
    genres: ['house'],
    targetPlaylists: null,
    location: null,
    activeSinceYear: null,
    venmoHandle: null,
    spotifyPopularity: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    userIsPro: false,
    userClerkId: 'clerk-1',
    userEmail: 'artist@example.com',
    userPlan: null,
    socialLinks: [],
    contacts: [],
    latestRelease: null,
    pressPhotos: [],
    ...overrides,
  } as ProfileWithLinks;
}

async function importLoader() {
  vi.resetModules();
  return import('@/app/[username]/_lib/public-profile-loader');
}

beforeEach(() => {
  vi.clearAllMocks();
  getProfileWithLinksMock.mockReset();
  // The loader's unstable_cache path is skipped under NODE_ENV=test; the
  // cache-configuration assertions below run under a production-like env.
  vi.stubEnv('NODE_ENV', 'test');
});

describe('public profile loader behavior (JOV-5778)', () => {
  it('short-circuits reserved handles to not_found without touching storage', async () => {
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('admin');

    expect(result.status).toBe('not_found');
    expect(result.profile).toBeNull();
    expect(getProfileWithLinksMock).not.toHaveBeenCalled();
  });

  it('normalizes the username to lowercase before the lookup', async () => {
    getProfileWithLinksMock.mockResolvedValue(buildProfileWithLinks());
    const { getProfileAndLinks } = await importLoader();

    await getProfileAndLinks('TestArtist');

    expect(getProfileWithLinksMock).toHaveBeenCalledWith('testartist', {
      skipCache: true,
    });
  });

  it('maps an ok profile into the loader contract', async () => {
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({
        userIsPro: true,
        userClerkId: 'clerk-9',
        userPlan: 'pro',
        genres: ['techno', 'house'],
      })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    expect(result.status).toBe('ok');
    expect(result.profile).not.toBeNull();
    expect(result.profile?.username).toBe('testartist');
    expect(result.profile?.display_name).toBe('Test Artist');
    expect(result.profile?.is_public).toBe(true);
    expect(result.creatorIsPro).toBe(true);
    expect(result.creatorClerkId).toBe('clerk-9');
    expect(result.genres).toEqual(['techno', 'house']);
  });

  it('treats truthy non-boolean isPublic values as public (neon-http edge case)', async () => {
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({ isPublic: 1 as never })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    expect(result.status).toBe('ok');
  });

  it('returns not_found for profiles that exist but are not public', async () => {
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({ isPublic: false })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    expect(result.status).toBe('not_found');
    expect(result.profile).toBeNull();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it('returns not_found when the profile service resolves nothing', async () => {
    getProfileWithLinksMock.mockResolvedValue(null);
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('ghost');

    expect(result.status).toBe('not_found');
  });

  it('degrades a storage failure to status error instead of throwing', async () => {
    getProfileWithLinksMock.mockRejectedValue(new Error('neon unavailable'));
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    expect(result.status).toBe('error');
    expect(result.profile).toBeNull();
    expect(result.links).toEqual([]);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Error fetching creator profile',
      expect.objectContaining({ route: '/[username]', username: 'testartist' }),
      'public-profile'
    );
  });

  it('maps social links into the legacy contract with normalized platforms', async () => {
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({
        socialLinks: [
          {
            id: 'link-1',
            creatorProfileId: 'profile-1',
            platform: 'Instagram',
            platformType: 'social',
            url: 'https://instagram.com/testartist',
            displayText: null,
            clicks: 4,
            isActive: true,
            sortOrder: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          },
        ],
      })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    expect(result.status).toBe('ok');
    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.platform).toBe('instagram');
    expect(result.links[0]?.url).toBe('https://instagram.com/testartist');
    expect(result.links[0]?.clicks).toBe(4);
    expect(result.links[0]?.artist_id).toBe('profile-1');
  });

  it('injects a synthetic venmo link from venmoHandle when no venmo link exists', async () => {
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({ venmoHandle: '@tip-me' })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    const venmoLink = result.links.find(link => link.platform === 'venmo');
    expect(venmoLink).toBeDefined();
    expect(venmoLink?.url).toBe('https://venmo.com/tip-me');
    expect(venmoLink?.artist_id).toBe('profile-1');
  });

  it('does not duplicate venmo when an explicit venmo link already exists', async () => {
    const venmoSocialLink = {
      id: 'link-venmo',
      creatorProfileId: 'profile-1',
      platform: 'venmo',
      platformType: 'tip',
      url: 'https://venmo.com/Existing',
      displayText: null,
      clicks: 0,
      isActive: true,
      sortOrder: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({
        venmoHandle: '@tip-me',
        socialLinks: [venmoSocialLink],
      })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    const venmoLinks = result.links.filter(link => link.platform === 'venmo');
    expect(venmoLinks).toHaveLength(1);
    expect(venmoLinks[0]?.url).toBe('https://venmo.com/Existing');
  });

  it('passes through contacts, latest release, and press photos untouched', async () => {
    const contacts = [
      { id: 'contact-1', label: 'Booking', value: 'book@example.com' },
    ] as never;
    const latestRelease = { id: 'release-1', title: 'New Track' } as never;
    const pressPhotos = [{ id: 'press-1' }] as never;
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({ contacts, latestRelease, pressPhotos })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    expect(result.contacts).toBe(contacts);
    expect(result.latestRelease).toBe(latestRelease);
    expect(result.pressPhotos).toBe(pressPhotos);
  });

  it('derives profile completion from display name, avatar, email, and DSP links', async () => {
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({
        displayName: 'Test Artist',
        avatarUrl: 'https://example.com/avatar.jpg',
        userEmail: 'artist@example.com',
        spotifyUrl: 'https://open.spotify.com/artist/123',
      })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    // All four required completion checks pass.
    expect(result.profile?.profile_completion_pct).toBe(100);
  });

  it('treats a DSP-platform social link as a music link for completion', async () => {
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({
        spotifyUrl: null,
        appleMusicUrl: null,
        youtubeUrl: null,
        socialLinks: [
          {
            id: 'link-dsp',
            creatorProfileId: 'profile-1',
            platform: 'Spotify',
            platformType: 'dsp',
            url: 'https://open.spotify.com/artist/123',
            displayText: null,
            clicks: 0,
            isActive: true,
            sortOrder: 0,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          },
        ],
      })
    );
    const { getProfileAndLinks } = await importLoader();

    const result = await getProfileAndLinks('testartist');

    // name + avatar + email + DSP social link = 4/4
    expect(result.profile?.profile_completion_pct).toBe(100);
  });

  describe('creator Meta pixel entitlement gate', () => {
    it('returns a null pixel when the creator plan lacks canAccessAdPixels', async () => {
      checkBooleanMock.mockReturnValue(false);
      getProfileWithLinksMock.mockResolvedValue(buildProfileWithLinks());
      const { getProfileAndLinks } = await importLoader();

      const result = await getProfileAndLinks('testartist');

      expect(result.status).toBe('ok');
      expect(result.creatorMetaPixelId).toBeNull();
      expect(checkBooleanMock).toHaveBeenCalledWith(null, 'canAccessAdPixels');
    });

    it('returns a null pixel (fail-closed) on lookup errors without failing the profile render', async () => {
      const { db } = await import('@/lib/db');
      vi.mocked(db.select).mockImplementation(() => {
        throw new Error('pixels table unavailable');
      });
      checkBooleanMock.mockReturnValue(true);
      getProfileWithLinksMock.mockResolvedValue(buildProfileWithLinks());
      const { getProfileAndLinks } = await importLoader();

      const result = await getProfileAndLinks('testartist');

      expect(result.status).toBe('ok');
      expect(result.creatorMetaPixelId).toBeNull();
      expect(loggerWarnMock).toHaveBeenCalledWith(
        'Creator Meta pixel lookup failed',
        expect.objectContaining({ creatorProfileId: 'profile-1' }),
        'public-profile'
      );
    });
  });

  describe('cache layer', () => {
    it('bypasses unstable_cache under NODE_ENV=test', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      getProfileWithLinksMock.mockResolvedValue(buildProfileWithLinks());
      const { getProfileAndLinks } = await importLoader();

      await getProfileAndLinks('testartist');

      expect(unstableCacheMock).not.toHaveBeenCalled();
      expect(getProfileWithLinksMock).toHaveBeenCalledTimes(1);
    });

    it('bypasses unstable_cache under PUBLIC_NOAUTH_SMOKE', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      process.env.PUBLIC_NOAUTH_SMOKE = '1';
      getProfileWithLinksMock.mockResolvedValue(buildProfileWithLinks());
      const { getProfileAndLinks } = await importLoader();

      await getProfileAndLinks('testartist');

      expect(unstableCacheMock).not.toHaveBeenCalled();
      delete process.env.PUBLIC_NOAUTH_SMOKE;
    });

    it('registers a per-username cache key with profile tags and a 1h revalidate', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.PUBLIC_NOAUTH_SMOKE;
      getProfileWithLinksMock.mockResolvedValue(buildProfileWithLinks());
      const { getProfileAndLinks } = await importLoader();

      await getProfileAndLinks('testartist');

      expect(unstableCacheMock).toHaveBeenCalledWith(
        ['public-profile-testartist'],
        {
          tags: ['profiles-all', 'profile:testartist'],
          revalidate: 3600,
        }
      );
    });

    it('does not cache non-ok results: the fetcher throws inside unstable_cache', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.PUBLIC_NOAUTH_SMOKE;
      getProfileWithLinksMock.mockResolvedValue(
        buildProfileWithLinks({ isPublic: false })
      );
      const { getProfileAndLinks } = await importLoader();

      // The unstable_cache wrapper runs the fetcher synchronously in this
      // mock; the NonCacheableProfileResultError must escape it and be
      // unwrapped back into the original not_found payload.
      const result = await getProfileAndLinks('testartist');

      expect(result.status).toBe('not_found');
    });
  });
});

describe('non-ok payload unwrapping through the cache throw path', () => {
  it('carries the original result object through NonCacheableProfileResultError', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.PUBLIC_NOAUTH_SMOKE;
    getProfileWithLinksMock.mockResolvedValue(
      buildProfileWithLinks({ isPublic: false })
    );
    const loader = await importLoader();

    const result = await loader.getProfileAndLinks('testartist');

    expect(result.status).toBe('not_found');
    expect(result.profile).toBeNull();
  });

  it('falls back to a fresh fetch when the cache layer itself throws', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.PUBLIC_NOAUTH_SMOKE;
    getProfileWithLinksMock.mockResolvedValueOnce(buildProfileWithLinks());
    // Simulate an unstable_cache infrastructure failure: this invocation of
    // the mocked unstable_cache returns a fetcher that throws on call.
    const { unstable_cache } = await import('next/cache');
    vi.mocked(unstable_cache).mockImplementationOnce((() => () => {
      throw new Error('cache store unavailable');
    }) as never);
    const loader = await importLoader();

    const result = await loader.getProfileAndLinks('testartist');

    expect(result.status).toBe('ok');
    expect(getProfileWithLinksMock).toHaveBeenCalledExactlyOnceWith(
      'testartist',
      {
        skipCache: true,
      }
    );
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.PUBLIC_NOAUTH_SMOKE;
});
