import { AUDIO_FORMAT_IDS } from '@jovie/audio-contracts';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_PLAYBACK_DERIVATIVE_METADATA_KEY,
  nextAudioDerivativeGeneration,
  parseAudioPlaybackDerivative,
  resolveRecordingPlayback,
  withAudioPlaybackDerivative,
} from './playback-derivative';

const pending = {
  status: 'pending',
  generation: 1,
  sourceFormatId: 'aiff',
  requestedAt: '2026-07-26T00:00:00.000Z',
} as const;

function derivativeMetadata(value: unknown) {
  return { [AUDIO_PLAYBACK_DERIVATIVE_METADATA_KEY]: value };
}

describe('audio playback derivative metadata', () => {
  it('keeps one stable metadata key', () => {
    expect(AUDIO_PLAYBACK_DERIVATIVE_METADATA_KEY).toBe(
      'audioPlaybackDerivative'
    );
  });

  it('round-trips a valid derivative without replacing sibling metadata', () => {
    const metadata = withAudioPlaybackDerivative(
      { spotifyId: 'track-1' },
      pending
    );

    expect(metadata.spotifyId).toBe('track-1');
    expect(parseAudioPlaybackDerivative(metadata)).toEqual(pending);
    expect(nextAudioDerivativeGeneration(metadata)).toBe(2);
  });

  it.each([
    null,
    {},
    { status: 'pending', generation: 0, sourceFormatId: 'aiff' },
    {
      status: 'ready',
      generation: 1,
      sourceFormatId: 'aiff',
      url: 'https://blob.example/preview.wav',
      mimeType: 'audio/wav',
      readyAt: '2026-07-26T00:00:00.000Z',
      outputBytes: 0,
    },
    {
      status: 'ready',
      generation: 1,
      sourceFormatId: 'aiff',
      url: 'javascript:alert(1)',
      mimeType: 'audio/mpeg',
      readyAt: '2026-07-26T00:00:00.000Z',
      outputBytes: 88_244,
    },
    {
      status: 'retrying',
      generation: 1,
      sourceFormatId: 'aiff',
      attempt: 3,
      maxAttempts: 2,
      retryAt: '2026-07-26T00:01:00.000Z',
    },
  ])('rejects malformed derivative metadata %#', value => {
    expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toBeNull();
  });

  it.each(
    AUDIO_FORMAT_IDS
  )('accepts %s as a typed derivative source format', sourceFormatId => {
    const value = { ...pending, sourceFormatId };
    expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toEqual(
      value
    );
  });

  it.each([
    undefined,
    null,
    '',
    [],
    1,
    { ...pending, generation: 1.5 },
    { ...pending, generation: 0 },
    { ...pending, generation: -1 },
    { ...pending, sourceFormatId: 'ogg' },
    { ...pending, sourceFormatId: 1 },
    { ...pending, requestedAt: null },
    { ...pending, status: 'unknown' },
  ])('rejects invalid derivative shape %#', value => {
    expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toBeNull();
  });

  it('accepts canonical ready metadata over HTTP and HTTPS', () => {
    for (const url of [
      'https://blob.example/preview.wav',
      'http://localhost/preview.wav',
    ]) {
      const value = {
        status: 'ready',
        generation: 1,
        sourceFormatId: 'aiff',
        url,
        mimeType: 'audio/wav',
        readyAt: '2026-07-26T00:00:01.000Z',
        outputBytes: 88_244,
      };
      expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toEqual(
        value
      );
    }
  });

  it.each([
    { url: 1 },
    { url: new URL('https://blob.example/preview.wav') },
    { url: 'not a URL' },
    { url: 'ftp://blob.example/preview.wav' },
    { mimeType: 'audio/mpeg' },
    { readyAt: null },
    { outputBytes: 1.5 },
    { outputBytes: 0 },
  ])('rejects ready metadata with invalid field %#', override => {
    const value = {
      status: 'ready',
      generation: 1,
      sourceFormatId: 'aiff',
      url: 'https://blob.example/preview.wav',
      mimeType: 'audio/wav',
      readyAt: '2026-07-26T00:00:01.000Z',
      outputBytes: 88_244,
      ...override,
    };
    expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toBeNull();
  });

  it.each([
    'invalid_source',
    'conversion_failed',
    'resource_limit',
    'storage_failed',
  ] as const)('accepts the %s terminal failure reason', reason => {
    const value = {
      status: 'failed',
      generation: 1,
      sourceFormatId: 'aiff',
      reason,
      failedAt: '2026-07-26T00:00:01.000Z',
    };
    expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toEqual(
      value
    );
  });

  it.each([
    { reason: 'unknown' },
    { failedAt: null },
  ])('rejects failed metadata with invalid field %#', override => {
    const value = {
      status: 'failed',
      generation: 1,
      sourceFormatId: 'aiff',
      reason: 'conversion_failed',
      failedAt: '2026-07-26T00:00:01.000Z',
      ...override,
    };
    expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toBeNull();
  });

  it.each([
    'platform_unsupported',
    'conversion_not_supported',
  ] as const)('accepts the %s unavailable reason', reason => {
    const value = {
      status: 'unavailable',
      generation: 1,
      sourceFormatId: 'aiff',
      reason,
    };
    expect(parseAudioPlaybackDerivative(derivativeMetadata(value))).toEqual(
      value
    );
  });

  it('rejects an unknown unavailable reason', () => {
    expect(
      parseAudioPlaybackDerivative(
        derivativeMetadata({
          status: 'unavailable',
          generation: 1,
          sourceFormatId: 'aiff',
          reason: 'unknown',
        })
      )
    ).toBeNull();
  });

  it('accepts retry boundaries and rejects every malformed retry field', () => {
    const valid = {
      status: 'retrying',
      generation: 1,
      sourceFormatId: 'aiff',
      attempt: 1,
      maxAttempts: 1,
      retryAt: '2026-07-26T00:01:00.000Z',
    };
    expect(parseAudioPlaybackDerivative(derivativeMetadata(valid))).toEqual(
      valid
    );

    for (const override of [
      { attempt: 0 },
      { attempt: 1.5 },
      { maxAttempts: 0 },
      { maxAttempts: 1.5 },
      { attempt: 2, maxAttempts: 1 },
      { retryAt: null },
    ]) {
      expect(
        parseAudioPlaybackDerivative(
          derivativeMetadata({ ...valid, ...override })
        )
      ).toBeNull();
    }
  });

  it('accepts only a timestamped superseded state', () => {
    const valid = {
      status: 'superseded',
      generation: 1,
      sourceFormatId: 'aiff',
      supersededAt: '2026-07-26T00:01:00.000Z',
    };
    expect(parseAudioPlaybackDerivative(derivativeMetadata(valid))).toEqual(
      valid
    );
    expect(
      parseAudioPlaybackDerivative(
        derivativeMetadata({ ...valid, supersededAt: null })
      )
    ).toBeNull();
  });

  it('starts the derivative generation at one without metadata', () => {
    expect(nextAudioDerivativeGeneration(undefined)).toBe(1);
  });
});

describe('recording playback resolution', () => {
  it('uses an existing verified preview without falling back to its master', () => {
    expect(
      resolveRecordingPlayback({
        audioFormat: null,
        audioUrl: 'https://blob.example/master.aiff',
        previewUrl: 'https://blob.example/verified-preview.wav',
        metadata: {},
      })
    ).toEqual({
      status: 'ready',
      source: 'derivative',
      url: 'https://blob.example/verified-preview.wav',
    });
  });

  it('uses a directly playable master', () => {
    expect(
      resolveRecordingPlayback({
        audioFormat: 'audio/mpeg',
        audioUrl: 'https://blob.example/master.mp3',
        metadata: {},
      })
    ).toEqual({
      status: 'ready',
      source: 'master',
      url: 'https://blob.example/master.mp3',
    });
  });

  it.each([
    {
      audioFormat: 'audio/mpeg',
      audioUrl: null,
      metadata: {},
    },
    {
      audioFormat: null,
      audioUrl: 'https://blob.example/master.mp3',
      metadata: {},
    },
    {
      audioFormat: 'audio/unknown',
      audioUrl: 'https://blob.example/master.bin',
      metadata: {},
    },
  ])('fails closed when a master is not fully typed %#', input => {
    expect(resolveRecordingPlayback(input)).toEqual({
      status: 'unavailable',
      source: null,
      url: null,
    });
  });

  it('does not expose an AIFF master while its derivative is pending', () => {
    expect(
      resolveRecordingPlayback({
        audioFormat: 'audio/aiff',
        audioUrl: 'https://blob.example/master.aiff',
        metadata: withAudioPlaybackDerivative({}, pending),
      })
    ).toEqual({ status: 'pending', source: null, url: null });
  });

  it('fails closed for a legacy AIFF preview that aliases its master', () => {
    expect(
      resolveRecordingPlayback({
        audioFormat: 'audio/aiff',
        audioUrl: 'https://blob.example/master.aiff',
        previewUrl: 'https://blob.example/master.aiff',
        metadata: {},
      })
    ).toEqual({ status: 'unavailable', source: null, url: null });
  });

  it('uses only a ready derivative for AIFF', () => {
    expect(
      resolveRecordingPlayback({
        audioFormat: 'audio/aiff',
        audioUrl: 'https://blob.example/master.aiff',
        metadata: withAudioPlaybackDerivative(
          {},
          {
            status: 'ready',
            generation: 1,
            sourceFormatId: 'aiff',
            url: 'https://blob.example/preview.wav',
            mimeType: 'audio/wav',
            readyAt: '2026-07-26T00:00:01.000Z',
            outputBytes: 88_244,
          }
        ),
      })
    ).toEqual({
      status: 'ready',
      source: 'derivative',
      url: 'https://blob.example/preview.wav',
    });
  });
});
