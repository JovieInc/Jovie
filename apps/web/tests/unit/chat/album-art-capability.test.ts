import { describe, expect, it } from 'vitest';
import {
  buildAlbumArtUnavailableAssistantMessage,
  detectAlbumArtGenerationIntent,
  resolveAlbumArtCapability,
} from '@/lib/chat/album-art-capability';

describe('album art capability resolution', () => {
  it('marks album art unavailable when the provider is not configured', () => {
    const capability = resolveAlbumArtCapability({
      featureEnabled: true,
      providerConfigured: false,
      entitlements: {
        canGenerateAlbumArt: true,
      } as Awaited<
        ReturnType<
          typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
        >
      >,
    });

    expect(capability).toEqual({
      availability: 'unavailable',
      reason: 'Album art generation is temporarily unavailable.',
      reasonCode: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('preflights typed generation requests but lets brief drafting through', () => {
    expect(
      detectAlbumArtGenerationIntent({
        text: 'Generate album art for my latest release.',
      })
    ).toBe(true);
    expect(
      detectAlbumArtGenerationIntent({
        text: 'Draft an album-art brief for my latest release.',
      })
    ).toBe(false);
  });

  it('builds a durable assistant recovery message', () => {
    expect(
      buildAlbumArtUnavailableAssistantMessage({
        availability: 'unavailable',
        reason: 'Album art generation is temporarily unavailable.',
        reasonCode: 'PROVIDER_UNAVAILABLE',
      })
    ).toContain('draft a cover concept');
  });
});
