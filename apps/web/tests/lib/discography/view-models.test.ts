import { describe, expect, it } from 'vitest';
import {
  buildProviderLabels,
  mapProviderLinksToViewModel,
} from '@/lib/discography/view-models';

describe('discography view-model mapping', () => {
  it('builds provider labels from config', () => {
    const labels = buildProviderLabels();

    expect(labels.spotify).toBe('Spotify');
    expect(labels.apple_music).toBe('Apple Music');
  });

  it('maps provider links with labels, source metadata, and smart-link paths', () => {
    const providers = mapProviderLinksToViewModel({
      providerLinks: [
        {
          providerId: 'spotify',
          url: 'https://open.spotify.com/track/123',
          sourceType: 'manual',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          providerId: 'youtube_music',
          url: 'https://music.youtube.com/watch?v=abc',
          sourceType: 'ingested',
          updatedAt: null,
        },
      ],
      profileHandle: 'tim-white',
      slug: 'night-drive',
    });

    expect(providers).toEqual([
      expect.objectContaining({
        key: 'spotify',
        label: 'Spotify',
        source: 'manual',
        path: '/tim-white/night-drive?dsp=spotify',
        isPrimary: true,
      }),
      expect.objectContaining({
        key: 'youtube_music',
        label: 'YouTube Music',
        source: 'ingested',
        path: '/tim-white/night-drive?dsp=youtube_music',
        isPrimary: false,
      }),
    ]);
  });
});
