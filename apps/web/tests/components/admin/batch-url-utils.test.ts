import { describe, expect, it } from 'vitest';
import { parseBatchUrls } from '@/components/admin/batch-url-utils';

describe('parseBatchUrls', () => {
  it('parses newline and comma separated URLs in one payload', () => {
    expect(
      parseBatchUrls(
        'https://linktr.ee/artist\nhttps://open.spotify.com/artist/123, https://instagram.com/artist'
      )
    ).toEqual([
      'https://linktr.ee/artist',
      'https://open.spotify.com/artist/123',
      'https://instagram.com/artist',
    ]);
  });

  it('drops empty entries and trims whitespace', () => {
    expect(
      parseBatchUrls('  \n  https://apple.music/artist/abc  ,,  ')
    ).toEqual(['https://apple.music/artist/abc']);
  });
});
