import { describe, expect, it } from 'vitest';
import { collectAlbumArtBlobUrls } from '@/lib/services/album-art/cleanup';

describe('collectAlbumArtBlobUrls', () => {
  it('collects unique preview, final, and background URLs from session payloads', () => {
    expect(
      collectAlbumArtBlobUrls({
        options: [
          {
            previewUrl: 'https://example.com/preview.png',
            finalImageUrl: 'https://example.com/final.png',
            backgroundUrl: 'https://example.com/bg.png',
          },
          {
            previewUrl: 'https://example.com/preview.png',
            finalImageUrl: 'https://example.com/final-2.png',
          },
        ],
      })
    ).toEqual([
      'https://example.com/preview.png',
      'https://example.com/final.png',
      'https://example.com/bg.png',
      'https://example.com/final-2.png',
    ]);
  });

  it('ignores malformed payloads', () => {
    expect(collectAlbumArtBlobUrls({})).toEqual([]);
    expect(collectAlbumArtBlobUrls(null)).toEqual([]);
  });
});
