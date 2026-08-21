import { describe, expect, it } from 'vitest';

import {
  buildAudioUploadPrompt,
  inferAudioEntity,
  shouldLandChatAudioOnExisting,
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
    expect(shouldLandChatAudioOnExisting(inference)).toBe(true);
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
    expect(inference.confidence).toBe('high');
    expect(inference.releaseId).toBeNull();
    expect(inference.suggestedTitle).toBe('brand new song');
  });

  it('asks instead of attaching when the catalog match is only a weak overlap', () => {
    const inference = inferAudioEntity({
      fileName: 'take-me-extra-over.mp3',
      catalog,
    });

    expect(inference.kind).toBe('new-track');
    expect(inference.confidence).toBe('low');
    expect(inference.releaseId).toBe('release-1');
    expect(inference.releaseTitle).toBe('Take Me Over');
    expect(shouldLandChatAudioOnExisting(inference)).toBe(false);
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

  it('asks the user how to classify a low-confidence match', () => {
    const prompt = buildAudioUploadPrompt({
      fileName: 'take-me-over-mix.mp3',
      previewUrl: 'https://example.com/audio.mp3',
      inference: {
        kind: 'new-track',
        confidence: 'low',
        suggestedTitle: 'take me over mix',
        releaseId: 'release-1',
        releaseTitle: 'Take Me Over',
        matchScore: 0.75,
      },
    });

    expect(prompt).toContain('saved it as a draft single');
    expect(prompt).toContain('Should I attach this to "Take Me Over"');
  });
});
