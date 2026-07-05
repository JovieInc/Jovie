import { describe, expect, it } from 'vitest';
import { isStrictZodObject } from '@/lib/chat/strict-schema';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';

function minimalValidInput(toolName: keyof typeof TOOL_SCHEMAS): unknown {
  switch (toolName) {
    case 'generateAlbumArt':
    case 'generateReleasePitch':
    case 'createMerch':
    case 'previewMerchOptions':
    case 'searchSpotifyArtist':
    case 'proposeCheckout':
      return {};
    case 'selectMerchDesign':
      return {
        generationId: '550e8400-e29b-41d4-a716-446655440000',
        optionNumber: 1,
      };
    case 'createMerchAlternativeItem':
      return {
        merchCardId: '550e8400-e29b-41d4-a716-446655440000',
        itemType: 'hoodie',
      };
    case 'publishMerchCard':
    case 'pauseMerchCard':
    case 'unpauseMerchCard':
    case 'deleteOrArchiveMerchCard':
      return { merchCardId: '550e8400-e29b-41d4-a716-446655440000' };
    case 'reorderMerchCards':
      return { merchCardIds: ['550e8400-e29b-41d4-a716-446655440000'] };
    case 'proposeSocialLink':
      return { url: 'https://instagram.com/jovie' };
    case 'proposeSocialLinkRemoval':
      return { platform: 'instagram' };
    case 'submitFeedback':
      return { message: 'Love the chat experience' };
    case 'confirmSpotifyArtist':
      return { spotifyArtistId: '4uA0L8H4DcXmKkJtGTQGzz' };
    case 'checkHandle':
      return { handle: 'jovie' };
    case 'recordInterviewSignal':
      return { releaseStage: 'just_released' };
    default:
      return {};
  }
}

describe('chat tool schemas strict mode', () => {
  for (const [toolName, schema] of Object.entries(TOOL_SCHEMAS)) {
    it(`${toolName} rejects unknown keys`, () => {
      expect(isStrictZodObject(schema.inputSchema)).toBe(true);

      const base = schema.inputSchema.safeParse(
        minimalValidInput(toolName as keyof typeof TOOL_SCHEMAS)
      );
      expect(base.success).toBe(true);
      if (!base.success) return;

      const withExtra = schema.inputSchema.safeParse({
        ...base.data,
        __unexpectedKey: 'injected',
      });
      expect(withExtra.success).toBe(false);
    });
  }
});
