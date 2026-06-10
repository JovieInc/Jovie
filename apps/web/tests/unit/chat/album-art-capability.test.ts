import { describe, expect, it } from 'vitest';
import {
  buildAlbumArtUnavailableAssistantMessage,
  detectAlbumArtGenerationIntent,
  filterSkillsHidingBrokenAlbumArt,
  resolveAlbumArtCapability,
  shouldHideAlbumArtChatSuggestion,
} from '@/lib/chat/album-art-capability';
import { commandsForSurface } from '@/lib/commands/registry';

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

  it('hides chat suggestions when provider is unavailable or feature is disabled', () => {
    expect(
      shouldHideAlbumArtChatSuggestion({
        availability: 'unavailable',
        reason: 'Album art generation is temporarily unavailable.',
        reasonCode: 'PROVIDER_UNAVAILABLE',
      })
    ).toBe(true);
    expect(
      shouldHideAlbumArtChatSuggestion({
        availability: 'unavailable',
        reason: 'Album art generation is not enabled for this workspace.',
        reasonCode: 'FEATURE_DISABLED',
      })
    ).toBe(true);
    expect(
      shouldHideAlbumArtChatSuggestion({
        availability: 'unavailable',
        reason: 'Album art generation requires a Pro plan.',
        reasonCode: 'PLAN_UNAVAILABLE',
      })
    ).toBe(false);
  });

  it('filters generateAlbumArt from slash/cmdk skills when provider is broken', () => {
    const skills = commandsForSurface('chat-slash').filter(
      command => command.kind === 'skill'
    );
    const filtered = filterSkillsHidingBrokenAlbumArt(skills, {
      availability: 'unavailable',
      reason: 'Album art generation is temporarily unavailable.',
      reasonCode: 'PROVIDER_UNAVAILABLE',
    });

    expect(filtered.some(skill => skill.id === 'generateAlbumArt')).toBe(false);
    expect(filtered.length).toBe(skills.length - 1);
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
