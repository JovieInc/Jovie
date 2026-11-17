import { describe, expect, it } from 'vitest';
import { buildReleaseAlbumArtChatPrompt } from '@/lib/chat/release-chat-prompts';

describe('buildReleaseAlbumArtChatPrompt', () => {
  it('names the clicked release as a chip, never JSON', () => {
    const prompt = buildReleaseAlbumArtChatPrompt({
      releaseId: 'release-9',
      releaseTitle: 'Wheels Up',
    });

    expect(prompt).toContain('@release:release-9[Wheels Up]');
    expect(prompt).toContain('three options');
    expect(prompt).not.toContain('{');
    expect(prompt).not.toContain('releaseId');
  });
});
