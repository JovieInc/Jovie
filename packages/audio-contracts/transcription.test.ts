import { describe, expect, it } from 'vitest';
import {
  AUDIO_TRANSCRIPTION_ERROR_CODES,
  AUDIO_TRANSCRIPTION_EVENTS,
  AUDIO_TRANSCRIPTION_EXECUTIONS,
  AUDIO_TRANSCRIPTION_PROVIDER_IDS,
  AUDIO_TRANSCRIPTION_PROVIDER_REGISTRY,
  AUDIO_TRANSCRIPTION_SOURCES,
  AUDIO_TRANSCRIPTION_STATUSES,
  type AudioTranscriptionEvent,
  type AudioTranscriptionStatus,
  createAudioTranscriptionProvenance,
  createAudioTranscriptionSegment,
  getNextAudioTranscriptionStatus,
} from './transcription';

describe('audio transcription registries', () => {
  it('keeps every cross-platform identifier unique and provider-complete', () => {
    for (const registry of [
      AUDIO_TRANSCRIPTION_STATUSES,
      AUDIO_TRANSCRIPTION_EVENTS,
      AUDIO_TRANSCRIPTION_SOURCES,
      AUDIO_TRANSCRIPTION_EXECUTIONS,
      AUDIO_TRANSCRIPTION_ERROR_CODES,
      AUDIO_TRANSCRIPTION_PROVIDER_IDS,
    ]) {
      expect(new Set(registry).size).toBe(registry.length);
    }
    expect(Object.keys(AUDIO_TRANSCRIPTION_PROVIDER_REGISTRY)).toEqual(
      AUDIO_TRANSCRIPTION_PROVIDER_IDS
    );
    for (const providerId of AUDIO_TRANSCRIPTION_PROVIDER_IDS) {
      expect(AUDIO_TRANSCRIPTION_PROVIDER_REGISTRY[providerId].id).toBe(
        providerId
      );
    }
  });

  it('models the complete successful lifecycle', () => {
    const events: readonly AudioTranscriptionEvent[] = [
      'permission-requested',
      'capture-started',
      'partial-result',
      'capture-stopped',
      'final-result',
    ];
    const statuses: AudioTranscriptionStatus[] = [];
    let status: AudioTranscriptionStatus = 'idle';
    for (const event of events) {
      status = getNextAudioTranscriptionStatus(status, event);
      statuses.push(status);
    }
    expect(statuses).toEqual([
      'requesting-permission',
      'listening',
      'partial',
      'processing',
      'completed',
    ]);
  });

  it('models empty, cancelled, failed, unsupported, reset, and invalid transitions', () => {
    expect(getNextAudioTranscriptionStatus('processing', 'empty-result')).toBe(
      'empty'
    );
    expect(getNextAudioTranscriptionStatus('listening', 'cancel')).toBe(
      'cancelled'
    );
    expect(getNextAudioTranscriptionStatus('partial', 'fail')).toBe('failed');
    expect(getNextAudioTranscriptionStatus('idle', 'unsupported')).toBe(
      'unsupported'
    );
    expect(getNextAudioTranscriptionStatus('failed', 'reset')).toBe('idle');
    expect(
      getNextAudioTranscriptionStatus('completed', 'capture-started')
    ).toBe('completed');
    expect(getNextAudioTranscriptionStatus('completed', 'cancel')).toBe(
      'completed'
    );
    expect(getNextAudioTranscriptionStatus('empty', 'fail')).toBe('empty');
    expect(getNextAudioTranscriptionStatus('listening', 'unsupported')).toBe(
      'listening'
    );
    expect(
      getNextAudioTranscriptionStatus(
        'listening',
        'unknown' as AudioTranscriptionEvent
      )
    ).toBe('listening');
  });

  it('matches the exact transition contract for every status-event pair', () => {
    const expectedByEvent: Readonly<
      Record<AudioTranscriptionEvent, readonly AudioTranscriptionStatus[]>
    > = {
      'permission-requested': [
        'requesting-permission',
        'requesting-permission',
        'listening',
        'partial',
        'processing',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      'capture-started': [
        'listening',
        'listening',
        'listening',
        'partial',
        'processing',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      'partial-result': [
        'idle',
        'requesting-permission',
        'partial',
        'partial',
        'processing',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      'capture-stopped': [
        'idle',
        'requesting-permission',
        'processing',
        'processing',
        'processing',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      'final-result': [
        'idle',
        'requesting-permission',
        'completed',
        'completed',
        'completed',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      'empty-result': [
        'idle',
        'requesting-permission',
        'empty',
        'empty',
        'empty',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      cancel: [
        'idle',
        'cancelled',
        'cancelled',
        'cancelled',
        'cancelled',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      fail: [
        'idle',
        'failed',
        'failed',
        'failed',
        'failed',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      unsupported: [
        'unsupported',
        'unsupported',
        'listening',
        'partial',
        'processing',
        'completed',
        'empty',
        'cancelled',
        'failed',
        'unsupported',
      ],
      reset: [
        'idle',
        'idle',
        'idle',
        'idle',
        'idle',
        'idle',
        'idle',
        'idle',
        'idle',
        'idle',
      ],
    };

    for (const event of AUDIO_TRANSCRIPTION_EVENTS) {
      expect(
        AUDIO_TRANSCRIPTION_STATUSES.map(status =>
          getNextAudioTranscriptionStatus(status, event)
        )
      ).toEqual(expectedByEvent[event]);
    }
  });

  it('creates provider-derived provenance and rejects mismatched execution', () => {
    expect(
      createAudioTranscriptionProvenance({
        provider: 'apple-speech',
        execution: 'on-device',
        locale: ' en-US ',
      })
    ).toEqual({
      source: 'speech-recognition',
      provider: 'apple-speech',
      execution: 'on-device',
      locale: 'en-US',
      modelId: undefined,
    });
    expect(
      createAudioTranscriptionProvenance({
        provider: 'youtube-captions',
        execution: 'network',
        modelId: ' captions-v1 ',
      })
    ).toEqual({
      source: 'captions',
      provider: 'youtube-captions',
      execution: 'network',
      locale: undefined,
      modelId: 'captions-v1',
    });
    expect(() =>
      createAudioTranscriptionProvenance({
        provider: 'web-speech',
        execution: 'on-device',
      })
    ).toThrow(
      'Execution on-device is invalid for transcription provider web-speech'
    );
    expect(() =>
      createAudioTranscriptionProvenance({
        provider: 'server-asr',
        execution: 'network',
        modelId: ' ',
      })
    ).toThrow('modelId must not be empty');
    expect(() =>
      createAudioTranscriptionProvenance({
        provider: 'server-asr',
        execution: 'network',
        locale: ' ',
      })
    ).toThrow('locale must not be empty');
    expect(
      createAudioTranscriptionProvenance({
        provider: 'server-asr',
        execution: 'network',
        locale: null,
      }).locale
    ).toBeUndefined();
  });

  it('normalizes valid segments and rejects ambiguous media coordinates', () => {
    expect(
      createAudioTranscriptionSegment({
        startSeconds: 1.25,
        durationSeconds: 0.5,
        text: ' hello ',
        confidence: 0.9,
        isFinal: true,
      })
    ).toEqual({
      startSeconds: 1.25,
      durationSeconds: 0.5,
      text: 'hello',
      confidence: 0.9,
      isFinal: true,
    });

    for (const [input, message] of [
      [
        { startSeconds: -1, durationSeconds: 0, text: 'x' },
        'startSeconds must be finite and non-negative',
      ],
      [
        { startSeconds: 0, durationSeconds: Number.NaN, text: 'x' },
        'durationSeconds must be finite and non-negative',
      ],
      [
        { startSeconds: 0, durationSeconds: -1, text: 'x' },
        'durationSeconds must be finite and non-negative',
      ],
      [
        { startSeconds: 0, durationSeconds: 0, text: ' ' },
        'transcription segment text must not be empty',
      ],
      [
        { startSeconds: 0, durationSeconds: 0, text: 'x', confidence: 1.1 },
        'confidence must be between 0 and 1',
      ],
      [
        { startSeconds: 0, durationSeconds: 0, text: 'x', confidence: -0.1 },
        'confidence must be between 0 and 1',
      ],
      [
        {
          startSeconds: 0,
          durationSeconds: 0,
          text: 'x',
          confidence: Number.NaN,
        },
        'confidence must be between 0 and 1',
      ],
    ] as const) {
      expect(() => createAudioTranscriptionSegment(input)).toThrow(message);
    }

    for (const confidence of [0, 1, undefined]) {
      expect(
        createAudioTranscriptionSegment({
          startSeconds: 0,
          durationSeconds: 0,
          text: 'x',
          confidence,
        }).confidence
      ).toBe(confidence);
    }
  });
});
