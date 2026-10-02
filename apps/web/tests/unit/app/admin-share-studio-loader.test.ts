import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discogReleases } from '@/lib/db/schema/content';

const mocks = vi.hoisted(() => ({
  blogs: vi.fn(),
  profiles: vi.fn(),
  profile: vi.fn(),
  releases: vi.fn(),
  playlists: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/blog/getBlogPosts', () => ({ getBlogPosts: mocks.blogs }));
vi.mock('@/lib/services/profile', () => ({
  getTopProfilesForStaticGeneration: mocks.profiles,
  getProfileByUsername: mocks.profile,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const query = {
          innerJoin: () => query,
          where: () => query,
          orderBy: () => query,
          limit: () =>
            table === discogReleases ? mocks.releases() : mocks.playlists(),
        };
        return query;
      },
    }),
  },
}));

import {
  loadShareStudioData,
  type ShareStudioType,
} from '@/app/app/(shell)/admin/share-studio/loader';

const RELEASE = {
  username: 'artist',
  artistName: 'Artist',
  fallbackArtistName: 'Artist',
  slug: 'song',
  title: 'Song',
  artworkUrl: null,
};

function seed(type: ShareStudioType) {
  switch (type) {
    case 'blog':
      mocks.blogs.mockResolvedValue([
        { slug: 'news', title: 'News', excerpt: 'News excerpt' },
      ]);
      break;
    case 'profile':
      mocks.profiles.mockResolvedValue([{ username: 'artist' }]);
      mocks.profile.mockResolvedValue({
        usernameNormalized: 'artist',
        username: 'artist',
        displayName: 'Artist',
        isPublic: true,
      });
      break;
    case 'release':
      mocks.releases.mockResolvedValue([RELEASE]);
      break;
    case 'playlist':
      mocks.playlists.mockResolvedValue([
        { slug: 'mix', title: 'Mix', coverImageUrl: null, editorialNote: null },
      ]);
      break;
  }
}

describe('Independent public share previews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blogs.mockResolvedValue([]);
    mocks.profiles.mockResolvedValue([]);
    mocks.releases.mockResolvedValue([]);
    mocks.playlists.mockResolvedValue([]);
  });
  it.each(['blog', 'profile', 'release', 'playlist'] as const)(
    'previews %s with the other three catalogs empty',
    async type => {
      seed(type);
      const result = await loadShareStudioData({}, type);
      expect(result.state).toBe('ready');
      expect(result.context?.surfaceType).toBe(type);
      expect(result.items).toHaveLength(1);
      expect(result.urlSearchParams.get(type)).toBe(result.selectedKey);
    }
  );
  it('does not read unrelated catalogs, even when they would hang', async () => {
    seed('release');
    mocks.blogs.mockImplementation(() => new Promise(() => {}));
    const result = await loadShareStudioData({}, 'release');
    expect(result.state).toBe('ready');
    expect(mocks.blogs).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.playlists).not.toHaveBeenCalled();
  });
  it('isolates a catalog exception from the release preview', async () => {
    seed('release');
    mocks.blogs.mockRejectedValue(new Error('invalid catalog'));
    const [blog, release] = await Promise.all([
      loadShareStudioData({}, 'blog'),
      loadShareStudioData({}, 'release'),
    ]);
    expect(blog.state).toBe('unavailable');
    expect(blog.context).toBeNull();
    expect(release.context?.canonicalUrl).toContain('/artist/song');
  });
  it.each(['blog', 'profile', 'release', 'playlist'] as const)(
    'distinguishes a genuinely empty %s catalog',
    async type => {
      const result = await loadShareStudioData({ [type]: 'missing' }, type);
      expect(result.state).toBe('empty');
      expect(result.context).toBeNull();
      expect(result.urlSearchParams.has(type)).toBe(false);
    }
  );
  it('keeps a valid selection stable across refresh and other picker changes', async () => {
    mocks.releases.mockResolvedValue([
      RELEASE,
      { ...RELEASE, slug: 'second', title: 'Second' },
    ]);
    const params = { release: 'artist:second', blog: 'news' };
    const first = await loadShareStudioData(params, 'release');
    const refreshed = await loadShareStudioData(params, 'release');
    expect(first.context).toEqual(refreshed.context);
    expect(first.context?.canonicalUrl).toContain('/artist/second');
    expect(first.context?.preparedText).toContain('Second');
    expect(first.context?.asset.url).toContain('slug=second');
    expect(first.urlSearchParams.get('blog')).toBe('news');
  });
  it('falls back to a public sample for an invalid requested entity', async () => {
    seed('release');
    const result = await loadShareStudioData(
      { release: 'private:missing' },
      'release'
    );
    expect(result.selectedKey).toBe('artist:song');
    expect(result.urlSearchParams.get('release')).toBe('artist:song');
  });
  it('excludes a nonpublic profile returned by the profile service', async () => {
    seed('profile');
    mocks.profile.mockResolvedValue({
      usernameNormalized: 'private',
      isPublic: false,
    });
    const result = await loadShareStudioData({ profile: 'private' }, 'profile');
    expect(result.state).toBe('empty');
    expect(result.items).toEqual([]);
  });
});
