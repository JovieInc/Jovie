import { describe, expect, it } from 'vitest';

import {
  buildAudioUploadPrompt,
  inferAudioEntity,
} from '@/lib/chat/infer-audio-entity';

describe('inferAudioEntity', () => {
  const catalog = [
    { id: 'release-1', title: 'Take Me Over', hasAudio: false },
    { id: 'release-2', title: 'Midnight Drive', hasAudio: true },
  ] as const;

  it('matches an existing release missing audio', () => {
    const inference = inferAudioEntity({
      fileName: 'Take_Me_Over_Master.wav',
      catalog,
    });

    expect(inference.kind).toBe('attach-to-existing');
    expect(inference.releaseId).toBe('release-1');
    expect(inference.confidence).toBe('high');
  });

  it('treats a matched release with audio as a reference', () => {
    const inference = inferAudioEntity({
      fileName: 'midnight-drive-reference.mp3',
      catalog,
    });

    expect(inference.kind).toBe('reference');
    expect(inference.releaseId).toBe('release-2');
  });

  it('creates a new track when no catalog match is strong enough', () => {
    const inference = inferAudioEntity({
      fileName: 'brand-new-song.mp3',
      catalog,
    });

    expect(inference.kind).toBe('new-track');
    expect(inference.releaseId).toBeNull();
    expect(inference.suggestedTitle).toBe('brand new song');
  });
});

describe('buildAudioUploadPrompt', () => {
  it('describes an attach-to-existing upload', () => {
    const prompt = buildAudioUploadPrompt({
      fileName: 'Take_Me_Over.wav',
      previewUrl: 'https://example.com/audio.wav',
      inference: {
        kind: 'attach-to-existing',
        confidence: 'high',
        suggestedTitle: 'Take Me Over',
        releaseId: 'release-1',
        releaseTitle: 'Take Me Over',
        matchScore: 1,
      },
    });

    expect(prompt).toContain('attached the audio');
    expect(prompt).toContain('Take Me Over');
  });
});
