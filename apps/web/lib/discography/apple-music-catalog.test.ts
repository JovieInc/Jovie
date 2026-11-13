import { describe, expect, it } from 'vitest';
import {
  type AppleCatalogAlbum,
  appleAlbumIdFromUrl,
  appleReleaseType,
  cleanAppleAlbumTitle,
  selectMissingAppleAlbums,
} from './apple-music-catalog';

const album = (
  id: string,
  name: string,
  extra: Partial<AppleCatalogAlbum['attributes']> = {}
): AppleCatalogAlbum => ({
  id,
  attributes: {
    name,
    artistName: 'Tim White',
    trackCount: 4,
    url: `https://music.apple.com/us/album/x/${id}`,
    ...extra,
  },
});

// Shaped after Tim White's Apple Music catalog on 2026-11-08 (JOV-7140).
const apple = [
  album('1', 'All This Noise - EP', { upc: '0859712345678' }),
  album('2', 'All This Noise (Remixed) - EP'),
  album('3', "Don't Let Go (with ONE&TWO) - Single", {
    artistName: 'Tim White & ONE&TWO',
    trackCount: 1,
  }),
  album('4', 'Seaside Heights - Single', { trackCount: 1 }),
  album('5', "Love Don't Let Me Down - Single", { upc: '111' }),
  album('6', "Love Don't Let Me Down - Single", { upc: '222' }),
  album('7', 'Summer Hits 2017', { artistName: 'Various Artists' }),
  album('8', 'Take Me Over - Single', { trackCount: 1 }),
];

const library = [
  { title: 'Seaside Heights', upc: null, appleAlbumIds: [] },
  { title: "Love Don't Let Me Down", upc: '0111', appleAlbumIds: [] },
  { title: 'Something Else', upc: null, appleAlbumIds: ['8'] },
];

describe('selectMissingAppleAlbums', () => {
  it('finds only the releases the Library lacks', () => {
    expect(
      selectMissingAppleAlbums(apple, library).map(a =>
        cleanAppleAlbumTitle(a.attributes.name)
      )
    ).toEqual([
      'All This Noise',
      'All This Noise (Remixed)',
      "Don't Let Go (with ONE&TWO)",
    ]);
  });

  it('treats a title already in the Library as present (versions are a choice)', () => {
    const missing = selectMissingAppleAlbums(apple, library);
    expect(missing.map(a => a.id)).not.toContain('4');
    expect(missing.map(a => a.id)).not.toContain('6');
  });

  it('skips Various Artists compilations and already-linked Apple albums', () => {
    const ids = selectMissingAppleAlbums(apple, library).map(a => a.id);
    expect(ids).not.toContain('7');
    expect(ids).not.toContain('8');
  });

  it('matches UPCs regardless of leading zeros', () => {
    const missing = selectMissingAppleAlbums(
      [album('9', 'Renamed On Apple', { upc: '00859712345678' })],
      [{ title: 'All This Noise', upc: '859712345678', appleAlbumIds: [] }]
    );
    expect(missing).toEqual([]);
  });

  it('imports nothing twice within one catalog', () => {
    const dupes = [album('a', 'New One - Single'), album('b', 'New One')];
    expect(selectMissingAppleAlbums(dupes, [])).toHaveLength(1);
  });
});

describe('Apple album helpers', () => {
  it.each([
    [album('1', 'All This Noise - EP'), 'ep'],
    [album('2', 'Wheels Up - Single', { trackCount: 2 }), 'single'],
    [album('3', 'Debut', { trackCount: 10 }), 'album'],
    [album('4', 'Best Of', { isCompilation: true }), 'compilation'],
    [album('5', 'One Track', { trackCount: 1 }), 'single'],
  ] as const)('types %j as %s', (a, type) => {
    expect(appleReleaseType(a)).toBe(type);
  });

  it('reads album IDs from Apple album URLs only', () => {
    expect(
      appleAlbumIdFromUrl(
        'https://music.apple.com/us/album/all-this-noise-ep/1031580711'
      )
    ).toBe('1031580711');
    expect(
      appleAlbumIdFromUrl(
        'https://music.apple.com/us/artist/tim-white/859547284'
      )
    ).toBeNull();
  });
});
