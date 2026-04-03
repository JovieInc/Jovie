import { describe, expect, it } from 'vitest';
import {
  collectAlbumArtBlobUrls,
  getAppliedSessionBackgroundUrlsToPreserve,
} from '@/lib/services/album-art/cleanup';

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

  it('preserves the applied background URL while cleaning the rest', () => {
    const payload = {
      appliedBackgroundUrl: 'https://example.com/selected-bg.png',
      options: [
        {
          previewUrl: 'https://example.com/preview-1.png',
          finalImageUrl: 'https://example.com/final-1.png',
          backgroundUrl: 'https://example.com/selected-bg.png',
        },
        {
          previewUrl: 'https://example.com/preview-2.png',
          finalImageUrl: 'https://example.com/final-2.png',
          backgroundUrl: 'https://example.com/unselected-bg.png',
        },
      ],
    };

    expect(getAppliedSessionBackgroundUrlsToPreserve(payload)).toEqual([
      'https://example.com/selected-bg.png',
    ]);
    expect(
      collectAlbumArtBlobUrls(payload, {
        preserveBackgroundUrls:
          getAppliedSessionBackgroundUrlsToPreserve(payload),
      })
    ).toEqual([
      'https://example.com/preview-1.png',
      'https://example.com/final-1.png',
      'https://example.com/preview-2.png',
      'https://example.com/final-2.png',
      'https://example.com/unselected-bg.png',
    ]);
  });

  it('keeps all backgrounds for older applied sessions without a tracked selection', () => {
    const payload = {
      options: [
        { backgroundUrl: 'https://example.com/bg-1.png' },
        { backgroundUrl: 'https://example.com/bg-2.png' },
      ],
    };

    expect(getAppliedSessionBackgroundUrlsToPreserve(payload)).toEqual([
      'https://example.com/bg-1.png',
      'https://example.com/bg-2.png',
    ]);
  });
});
