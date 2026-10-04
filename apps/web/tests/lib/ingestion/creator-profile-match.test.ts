// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isSameSourceIdentity,
  youtubeChannelKey,
} from '@/lib/ingestion/creator-profile-match';

describe('youtubeChannelKey', () => {
  it.each([
    ['https://www.youtube.com/@Creator/about', 'handle:creator'],
    ['https://youtube.com/@creator', 'handle:creator'],
    [
      'https://www.youtube.com/channel/UCabcdefghijklmnopqr12/about',
      'channel:ucabcdefghijklmnopqr12',
    ],
    ['https://www.youtube.com/c/SomeName', 'c:somename'],
  ])('keys %s as %s', (url, key) => {
    expect(youtubeChannelKey(url)).toBe(key);
  });

  it('keeps @handle, /channel, and /c identities distinct', () => {
    expect(youtubeChannelKey('https://www.youtube.com/@same/about')).not.toBe(
      youtubeChannelKey('https://www.youtube.com/c/same')
    );
    expect(youtubeChannelKey('https://www.youtube.com/c/same')).not.toBe(
      youtubeChannelKey('https://www.youtube.com/channel/same')
    );
  });

  it('returns null for non-channel paths and invalid URLs', () => {
    expect(youtubeChannelKey('https://www.youtube.com/')).toBeNull();
    expect(youtubeChannelKey('not a url')).toBeNull();
  });
});

describe('isSameSourceIdentity', () => {
  const source = 'https://www.youtube.com/@creator/about';

  it('matches the same channel across youtube URL spellings', () => {
    for (const candidate of [
      'https://www.youtube.com/@creator',
      'https://youtube.com/@CREATOR/videos',
      'https://m.youtube.com/@creator',
    ]) {
      expect(isSameSourceIdentity('youtube', source, candidate)).toBe(true);
    }
  });

  it('rejects different channels and same-slug different identities', () => {
    for (const candidate of [
      'https://www.youtube.com/@other',
      'https://www.youtube.com/c/creator',
      'https://www.youtube.com/channel/creator',
      'https://example.com/@creator',
    ]) {
      expect(isSameSourceIdentity('youtube', source, candidate)).toBe(false);
    }
  });

  it('matches handles case-insensitively on non-youtube platforms', () => {
    expect(
      isSameSourceIdentity(
        'instagram',
        'https://www.instagram.com/creator',
        'https://instagram.com/@CREATOR'
      )
    ).toBe(true);
    expect(
      isSameSourceIdentity(
        'tiktok',
        'https://www.tiktok.com/@creator',
        'https://tiktok.com/@other'
      )
    ).toBe(false);
    // Same handle on a different platform host is not the same identity.
    expect(
      isSameSourceIdentity(
        'instagram',
        'https://www.instagram.com/creator',
        'https://www.tiktok.com/@creator'
      )
    ).toBe(false);
  });
});
