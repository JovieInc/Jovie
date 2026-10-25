import { describe, expect, it } from 'vitest';
import {
  localizeAppleMusicUrl,
  localizeProviderUrl,
  normalizeVisitorCountry,
} from './storefront';

const ALBUM = 'https://music.apple.com/us/album/the-sound-single/1361927050';

describe('Apple Music storefront decision table', () => {
  it.each([
    ['US', ALBUM],
    ['us', ALBUM],
    ['JP', 'https://music.apple.com/jp/album/the-sound-single/1361927050'],
    ['de', 'https://music.apple.com/de/album/the-sound-single/1361927050'],
    ['GB', 'https://music.apple.com/gb/album/the-sound-single/1361927050'],
    ['BR', 'https://music.apple.com/br/album/the-sound-single/1361927050'],
    [null, ALBUM],
    [undefined, ALBUM],
    ['', ALBUM],
    ['XX', ALBUM],
    ['T1', ALBUM],
  ])('country %s -> %s', (country, expected) => {
    expect(localizeAppleMusicUrl(ALBUM, country)).toBe(expected);
  });

  it('keeps query params, ?i= track ids and fragments', () => {
    expect(
      localizeAppleMusicUrl(
        'https://music.apple.com/us/album/x/1?i=2&utm_source=jovie#a',
        'fr'
      )
    ).toBe('https://music.apple.com/fr/album/x/1?i=2&utm_source=jovie#a');
  });

  it('handles artist/playlist paths and geo.music.apple.com', () => {
    expect(
      localizeAppleMusicUrl(
        'https://music.apple.com/us/artist/t/859547284',
        'mx'
      )
    ).toBe('https://music.apple.com/mx/artist/t/859547284');
    expect(
      localizeAppleMusicUrl('https://geo.music.apple.com/us/album/x/1', 'ca')
    ).toBe('https://geo.music.apple.com/ca/album/x/1');
  });

  it.each([
    'https://music.apple.com/album/x/1',
    'https://itunes.apple.com/us/album/x/1',
    'https://open.spotify.com/album/abc',
    'not a url',
  ])('leaves %s untouched', url => {
    expect(localizeAppleMusicUrl(url, 'jp')).toBe(url);
  });

  it('only rewrites the apple_music provider', () => {
    expect(
      localizeProviderUrl('spotify', 'https://music.apple.com/us/a/1', 'jp')
    ).toBe('https://music.apple.com/us/a/1');
    expect(localizeProviderUrl('apple_music', ALBUM, 'jp')).toContain('/jp/');
  });

  it('normalizes only real storefronts', () => {
    expect(normalizeVisitorCountry(' JP ')).toBe('jp');
    expect(normalizeVisitorCountry('ZZ')).toBeNull();
  });
});
