import { describe, expect, it } from 'vitest';
import { derivePreviewState } from '@/lib/discography/audio-qa';

describe('derivePreviewState', () => {
  it('keeps tracks without preview-resolution metadata in the missing state', () => {
    expect(
      derivePreviewState({
        audioUrl: null,
        previewUrl: null,
        isrc: 'USUM72212345',
        metadata: null,
        providerLinks: [
          {
            providerId: 'spotify',
            url: 'https://open.spotify.com/track/123',
          },
        ],
      })
    ).toEqual({
      previewSource: null,
      previewVerification: 'missing',
    });
  });

  it('surfaces unknown only when preview-resolution metadata says lookup completed', () => {
    expect(
      derivePreviewState({
        audioUrl: null,
        previewUrl: null,
        isrc: 'USUM72212345',
        metadata: {
          previewResolution: {
            status: 'unknown',
            source: null,
          },
        },
        providerLinks: [
          {
            providerId: 'spotify',
            url: 'https://open.spotify.com/track/123',
          },
        ],
      })
    ).toEqual({
      previewSource: null,
      previewVerification: 'unknown',
    });
  });
});
