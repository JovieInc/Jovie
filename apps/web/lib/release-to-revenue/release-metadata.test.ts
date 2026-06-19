import { describe, expect, it } from 'vitest';
import { resolveReleaseMetadataFromManual } from './release-metadata';

describe('resolveReleaseMetadataFromManual', () => {
  it('builds release metadata with smart link path when slug is provided', () => {
    const metadata = resolveReleaseMetadataFromManual(
      {
        triggerSource: 'manual',
        title: 'Midnight Drive',
        artworkUrl: 'https://cdn.example.com/art.jpg',
        slug: 'midnight-drive',
        links: [
          {
            providerId: 'spotify',
            url: 'https://open.spotify.com/track/abc',
          },
        ],
      },
      'timwhite'
    );

    expect(metadata).toEqual({
      title: 'Midnight Drive',
      artworkUrl: 'https://cdn.example.com/art.jpg',
      slug: 'midnight-drive',
      smartLinkPath: '/timwhite/midnight-drive',
      links: [
        {
          providerId: 'spotify',
          url: 'https://open.spotify.com/track/abc',
        },
      ],
    });
  });

  it('rejects empty provider links and trims title whitespace', () => {
    const metadata = resolveReleaseMetadataFromManual(
      {
        triggerSource: 'manual',
        title: '  New Single  ',
        links: [
          { providerId: 'spotify', url: '   ' },
          { providerId: 'apple_music', url: 'https://music.apple.com/track/1' },
        ],
      },
      'timwhite'
    );

    expect(metadata.title).toBe('New Single');
    expect(metadata.links).toEqual([
      {
        providerId: 'apple_music',
        url: 'https://music.apple.com/track/1',
      },
    ]);
  });
});
