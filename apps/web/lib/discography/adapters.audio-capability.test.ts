import { describe, expect, it } from 'vitest';
import { mapTrackToViewModel } from './adapters';
import type { ProviderKey } from './types';

function track(metadata: Record<string, unknown>, previewUrl: string | null) {
  return {
    id: 'recording-1',
    releaseId: 'release-1',
    title: 'First Light',
    slug: 'first-light',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 60_000,
    isrc: null,
    isExplicit: false,
    previewUrl,
    audioUrl: 'https://blob.example/master.aiff',
    audioFormat: 'audio/aiff',
    metadata,
    providerLinks: [],
  };
}

function map(metadata: Record<string, unknown>, previewUrl: string | null) {
  return mapTrackToViewModel({
    track: track(metadata, previewUrl),
    providerLabels: {} as Record<ProviderKey, string>,
    profileHandle: 'artist',
    releaseSlug: 'first-light',
  });
}

describe('track view-model audio capability', () => {
  it('does not hand an AIFF master to playback while conversion is pending', () => {
    const result = map(
      {
        audioPlaybackDerivative: {
          status: 'pending',
          generation: 1,
          sourceFormatId: 'aiff',
          requestedAt: '2026-07-26T00:00:00.000Z',
        },
      },
      null
    );

    expect(result.previewUrl).toBeNull();
    expect(result.audioUrl).toBeNull();
    expect(result.previewSource).toBeNull();
    expect(result.previewVerification).toBe('missing');
  });

  it('does not trust a legacy AIFF preview that aliases its master', () => {
    const result = map({}, 'https://blob.example/master.aiff');

    expect(result.previewUrl).toBeNull();
    expect(result.audioUrl).toBeNull();
    expect(result.previewSource).toBeNull();
    expect(result.previewVerification).toBe('missing');
  });

  it('hands consumers only the ready AIFF derivative', () => {
    const result = map(
      {
        audioPlaybackDerivative: {
          status: 'ready',
          generation: 1,
          sourceFormatId: 'aiff',
          url: 'https://blob.example/preview.wav',
          mimeType: 'audio/wav',
          readyAt: '2026-07-26T00:00:01.000Z',
          outputBytes: 88_244,
        },
      },
      'https://blob.example/preview.wav'
    );

    expect(result.previewUrl).toBe('https://blob.example/preview.wav');
    expect(result.audioUrl).toBe('https://blob.example/preview.wav');
    expect(result.previewSource).toBe('audio_url');
    expect(result.previewVerification).toBe('verified');
  });
});
