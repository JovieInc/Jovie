import { describe, expect, it } from 'vitest';
import {
  AUDIO_CAPABILITY_PLATFORMS,
  AUDIO_CAPABILITY_REGISTRY,
  AUDIO_FORMAT_IDS,
  type AudioPlaybackAsset,
  getAudioCapability,
  resolveAudioSource,
} from './index';

const AIFF_MASTER = {
  formatId: 'aiff',
  masterUrl: 'https://blob.example/master.aiff',
} as const satisfies AudioPlaybackAsset;

describe('audio capability registry', () => {
  it('defines every platform and purpose for every accepted format', () => {
    expect(Object.keys(AUDIO_CAPABILITY_REGISTRY)).toEqual(AUDIO_FORMAT_IDS);

    for (const formatId of AUDIO_FORMAT_IDS) {
      expect(Object.keys(AUDIO_CAPABILITY_REGISTRY[formatId])).toEqual(
        AUDIO_CAPABILITY_PLATFORMS
      );
      for (const platform of AUDIO_CAPABILITY_PLATFORMS) {
        expect(
          Object.keys(AUDIO_CAPABILITY_REGISTRY[formatId][platform])
        ).toEqual([
          'uploadAcceptance',
          'masterPreservation',
          'nativePlayback',
          'waveformDecode',
          'analysisInput',
        ]);
      }
    }
  });

  it('keeps acceptance separate from real Chromium decode capability', () => {
    expect(getAudioCapability('aiff', 'web_chromium', 'uploadAcceptance')).toBe(
      'direct'
    );
    expect(
      getAudioCapability('aiff', 'web_chromium', 'masterPreservation')
    ).toBe('direct');
    expect(getAudioCapability('aiff', 'web_chromium', 'nativePlayback')).toBe(
      'derivative_required'
    );
    expect(getAudioCapability('aiff', 'web_chromium', 'waveformDecode')).toBe(
      'derivative_required'
    );
    expect(getAudioCapability('mp3', 'web_chromium', 'nativePlayback')).toBe(
      'direct'
    );
  });

  it('fails closed for unverified iOS capability', () => {
    expect(
      getAudioCapability('m4a', 'ios_avfoundation', 'nativePlayback')
    ).toBe('unverified');
    expect(
      resolveAudioSource(
        { formatId: 'm4a', masterUrl: 'https://blob.example/master.m4a' },
        'ios_avfoundation',
        'nativePlayback'
      )
    ).toEqual({ status: 'unavailable', source: null, url: null });
  });

  it('never lets a ready derivative override an unverified platform', () => {
    expect(
      resolveAudioSource(
        {
          formatId: 'aiff',
          masterUrl: 'https://blob.example/master.aiff',
          derivative: {
            generation: 1,
            sourceFormatId: 'aiff',
            status: 'ready',
            url: 'https://blob.example/preview.wav',
            mimeType: 'audio/wav',
            readyAt: '2026-07-26T00:00:01.000Z',
            outputBytes: 88_244,
          },
        },
        'ios_avfoundation',
        'nativePlayback'
      )
    ).toEqual({ status: 'unavailable', source: null, url: null });
  });
});

describe('audio source resolution', () => {
  it('returns a directly supported master without requiring a derivative', () => {
    expect(
      resolveAudioSource(
        { formatId: 'flac', masterUrl: 'https://blob.example/master.flac' },
        'web_chromium',
        'waveformDecode'
      )
    ).toEqual({
      status: 'ready',
      source: 'master',
      url: 'https://blob.example/master.flac',
    });
  });

  it('reports a missing required derivative as unavailable', () => {
    expect(
      resolveAudioSource(AIFF_MASTER, 'web_chromium', 'nativePlayback')
    ).toEqual({ status: 'unavailable', source: null, url: null });
  });

  it.each([
    'pending',
    'failed',
    'unavailable',
    'retrying',
    'superseded',
  ] as const)('never exposes an AIFF master while derivative is %s', status => {
    const common = {
      generation: 1,
      sourceFormatId: 'aiff' as const,
    };
    const derivative = {
      pending: {
        ...common,
        status: 'pending' as const,
        requestedAt: '2026-07-26T00:00:00.000Z',
      },
      failed: {
        ...common,
        status: 'failed' as const,
        reason: 'conversion_failed' as const,
        failedAt: '2026-07-26T00:00:00.000Z',
      },
      unavailable: {
        ...common,
        status: 'unavailable' as const,
        reason: 'conversion_not_supported' as const,
      },
      retrying: {
        ...common,
        status: 'retrying' as const,
        attempt: 1,
        maxAttempts: 3,
        retryAt: '2026-07-26T00:01:00.000Z',
      },
      superseded: {
        ...common,
        status: 'superseded' as const,
        supersededAt: '2026-07-26T00:00:00.000Z',
      },
    }[status];

    expect(
      resolveAudioSource(
        { ...AIFF_MASTER, derivative },
        'web_chromium',
        'nativePlayback'
      )
    ).toEqual({ status, source: null, url: null });
  });

  it('returns only the ready AIFF derivative for playback and waveform decode', () => {
    const asset: AudioPlaybackAsset = {
      ...AIFF_MASTER,
      derivative: {
        generation: 1,
        sourceFormatId: 'aiff',
        status: 'ready',
        url: 'https://blob.example/preview.wav',
        mimeType: 'audio/wav',
        readyAt: '2026-07-26T00:00:01.000Z',
        outputBytes: 88_244,
      },
    };

    for (const purpose of ['nativePlayback', 'waveformDecode'] as const) {
      expect(resolveAudioSource(asset, 'web_chromium', purpose)).toEqual({
        status: 'ready',
        source: 'derivative',
        url: 'https://blob.example/preview.wav',
      });
    }
  });
});
