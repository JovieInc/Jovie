import { describe, expect, it } from 'vitest';
import {
  buildBlogShareContext,
  buildPlaylistShareContext,
  buildProfileShareContext,
  buildReleaseShareContext,
} from './context';

describe('share context builders', () => {
  it('builds a canonical release share context with tracked metadata', () => {
    const context = buildReleaseShareContext({
      username: 'timwhite',
      slug: 'midnight-drive',
      title: 'Midnight Drive',
      artistName: 'Tim White',
      artworkUrl: 'https://example.com/artwork.png',
      pathname: '/timwhite/midnight-drive',
    });

    expect(context.surfaceType).toBe('release');
    expect(context.canonicalUrl).toContain('/timwhite/midnight-drive');
    expect(context.displayUrl).toContain('jov.ie/timwhite/midnight-drive');
    expect(context.preparedText).toBe(
      'Listen to Midnight Drive by Tim White on Jovie'
    );
    expect(context.asset.url).toContain(
      '/api/share/story/release?username=timwhite&slug=midnight-drive'
    );
    expect(context.utmContext.releaseSlug).toBe('midnight-drive');
  });

  it('supports direct story asset params for releases without a public username', () => {
    const context = buildReleaseShareContext({
      username: 'release',
      slug: 'midnight-drive',
      title: 'Midnight Drive',
      artistName: 'Tim White',
      artworkUrl: 'https://example.com/artwork.png',
      pathname: '/r/midnight-drive',
      storyQueryParams: {
        slug: 'midnight-drive',
        title: 'Midnight Drive',
        artistName: 'Tim White',
        pathname: '/r/midnight-drive',
        artworkUrl: 'https://example.com/artwork.png',
      },
    });

    expect(context.asset.url).toContain('/api/share/story/release?');
    expect(context.asset.url).toContain('username=release');
    expect(context.asset.url).toContain('pathname=%2Fr%2Fmidnight-drive');
    expect(context.asset.url).toContain('artistName=Tim+White');
  });

  it('builds blog, profile, and playlist contexts with expected canonical urls', () => {
    const blog = buildBlogShareContext({
      slug: 'share-systems',
      title: 'Share Systems',
      excerpt: 'A reusable share system for public pages.',
    });
    const profile = buildProfileShareContext({
      username: 'timwhite',
      artistName: 'Tim White',
      avatarUrl: null,
      bio: 'Founder profile',
    });
    const playlist = buildPlaylistShareContext({
      slug: 'late-night-selects',
      title: 'Late Night Selects',
      coverImageUrl: null,
      editorialNote: 'Moody electronic picks.',
    });

    expect(blog.canonicalUrl).toContain('/blog/share-systems');
    expect(profile.canonicalUrl).toContain('/timwhite');
    expect(playlist.canonicalUrl).toContain('/playlists/late-night-selects');
  });
});
