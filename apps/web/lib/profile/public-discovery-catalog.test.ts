import { afterEach, describe, expect, it, vi } from 'vitest';

const { select, assess, orderBy } = vi.hoisted(() => ({
  select: vi.fn(),
  assess: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('./completeness.server', () => ({ loadProfileCompleteness: assess }));
vi.mock('@/lib/db', () => ({ db: { select } }));
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', email: 'email' },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    username: 'username',
    displayName: 'displayName',
    avatarUrl: 'avatarUrl',
    bio: 'bio',
    isPublic: 'isPublic',
    isClaimed: 'isClaimed',
    userId: 'userId',
  },
}));

import {
  loadArtistsDirectoryProfiles,
  toArtistsDirectoryProfiles,
} from './public-discovery-catalog';

describe('artists directory catalog (JOV-6260)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  function databaseRows() {
    vi.stubEnv('DATABASE_URL', 'postgres://synthetic/unused');
    select.mockReturnValue({
      from: () => ({ leftJoin: () => ({ where: () => ({ orderBy }) }) }),
    });
    orderBy.mockResolvedValue([
      {
        id: 'artist',
        username: 'riverlane',
        displayName: 'River Lane',
        avatarUrl: 'https://cdn.jov.ie/river.jpg',
        bio: 'Soul artist from Atlanta.',
        isPublic: true,
      },
    ]);
  }
  it('rereads completeness and removes a formerly eligible profile on the next request', async () => {
    databaseRows();
    assess
      .mockResolvedValueOnce(new Map([['artist', { eligible: true }]]))
      .mockResolvedValueOnce(new Map([['artist', { eligible: false }]]));
    expect(await loadArtistsDirectoryProfiles()).toMatchObject({
      status: 'ok',
      profiles: [{ username: 'riverlane' }],
    });
    expect(await loadArtistsDirectoryProfiles()).toEqual({
      status: 'ok',
      profiles: [],
    });
    expect(select).toHaveBeenCalledTimes(2);
    expect(assess).toHaveBeenNthCalledWith(2, ['artist']);
  });
  it('does not return a cached eligible list when the assessment read fails', async () => {
    databaseRows();
    assess.mockRejectedValueOnce(new Error('assessment unavailable'));
    expect(await loadArtistsDirectoryProfiles()).toEqual({
      status: 'unavailable',
    });
  });
  it('fails closed without a configured database', async () => {
    vi.stubEnv('DATABASE_URL', undefined);
    expect(await loadArtistsDirectoryProfiles()).toEqual({
      status: 'unavailable',
    });
    expect(select).not.toHaveBeenCalled();
  });
  it('excludes ineligible identities from the HTML directory, not only XML catalogs', () => {
    const profiles = toArtistsDirectoryProfiles(
      [
        {
          id: 'test-realistic',
          username: 'jordanmiles',
          handle: 'jordanmiles',
          displayName: 'Jordan Miles',
          avatarUrl: 'https://cdn.jov.ie/avatars/jordan.jpg',
          bio: 'Independent artist from Nashville.',
          isPublic: true,
          ownerEmail: 'e2e+jordan@example.com',
        },
        {
          id: 'private',
          username: 'privateband',
          handle: 'privateband',
          displayName: 'Private Band',
          avatarUrl: null,
          bio: 'Keep this off the directory.',
          isPublic: false,
          ownerEmail: 'hello@privateband.com',
        },
        {
          id: 'unpublished',
          username: 'newrelease',
          handle: 'newrelease',
          displayName: 'New Release',
          avatarUrl: '/avatars/new-release.png',
          bio: 'Was public yesterday.',
          isPublic: false,
          ownerEmail: 'manager@newrelease.studio',
        },
        {
          id: 'qa-machine',
          username: 'tmoc0g1x9dwmk71',
          handle: 'tmoc0g1x9dwmk71',
          displayName: 'Jordan Miles',
          avatarUrl: '/avatars/default-user.png',
          bio: 'Looks real, minted by QA.',
          isPublic: true,
          ownerEmail: 'jordan@miles.audio',
        },
        {
          id: 'artist',
          username: 'tim',
          handle: 'tim',
          displayName: 'Tim White',
          avatarUrl: '/images/avatars/tim-white.jpg',
          bio: 'Artist',
          isPublic: true,
          ownerEmail: 'tim@timwhite.audio',
        },
        {
          id: 'non-artist',
          username: 'truecrimedaily',
          handle: 'truecrimedaily',
          displayName: 'True Crime Daily',
          avatarUrl: null,
          bio: 'Podcast',
          isPublic: true,
          ownerEmail: 'studio@truecrimedaily.com',
        },
      ],
      new Set(['artist', 'non-artist'])
    );

    expect(profiles.map(profile => profile.username)).toEqual(['tim']);
  });

  it('drops claimed public placeholders whose display name equals the handle', () => {
    const profiles = toArtistsDirectoryProfiles(
      [
        {
          id: 'hello',
          username: 'hello',
          handle: 'hello',
          displayName: 'hello',
          avatarUrl: null,
          bio: 'Placeholder identity.',
          isPublic: true,
          ownerEmail: 'hello@example.net',
        },
        {
          id: 'ti89m',
          username: 'ti89m',
          handle: 'ti89m',
          displayName: 'ti89m',
          avatarUrl: null,
          bio: 'Placeholder identity.',
          isPublic: true,
          ownerEmail: 'ti89m@example.net',
        },
        {
          id: 'tim1',
          username: 'tim1',
          handle: 'tim1',
          displayName: 'tim1',
          avatarUrl: null,
          bio: 'Placeholder identity.',
          isPublic: true,
          ownerEmail: 'tim1@example.net',
        },
        {
          id: 'artist',
          username: 'tim',
          handle: 'tim',
          displayName: 'Tim White',
          avatarUrl: '/images/avatars/tim-white.jpg',
          bio: 'Artist',
          isPublic: true,
          ownerEmail: 'tim@timwhite.audio',
        },
      ],
      new Set(['artist', 'non-artist'])
    );

    expect(profiles.map(profile => profile.username)).toEqual(['tim']);
  });

  it('fails closed when the eligibility source is missing', () => {
    expect(toArtistsDirectoryProfiles(undefined)).toEqual([]);
    expect(toArtistsDirectoryProfiles(null)).toEqual([]);
  });
});
