import { describe, expect, it } from 'vitest';
import {
  AUDIO_ANALYSIS_CAPABILITIES,
  AUDIO_ANALYSIS_EXECUTION_TARGET,
  AUDIO_ANALYSIS_FAILURE_CODES,
  AUDIO_ANALYSIS_JOB_STATUSES,
  AUDIO_ANALYSIS_MAX_ATTEMPTS,
  AUDIO_ANALYSIS_MAX_MEMORY_MB,
  AUDIO_ANALYSIS_MAX_TIMEOUT_MS,
  AUDIO_ANALYSIS_OUTCOME_STATUSES,
  type AudioAnalysisCapability,
  analysisConfidence,
  createAudioAnalysisJobRequest,
  createAudioAnalysisProvenance,
  createCanonicalMusicalKey,
  isoTimestamp,
  MUSICAL_KEY_MODES,
  MUSICAL_KEY_TONICS,
  type MusicalKeyMode,
  type MusicalKeyTonic,
  sha256ContentHash,
} from './index';

const CONTENT_HASH = `sha256:${'ab'.repeat(32)}`;
const ANALYZED_AT = '2026-07-22T20:15:30.000Z';

describe('audio analysis registries', () => {
  it('keeps capabilities, lifecycle states, tonics, and modes canonical', () => {
    expect(AUDIO_ANALYSIS_CAPABILITIES).toEqual([
      'tempo',
      'beat_grid',
      'musical_key',
    ]);
    expect(AUDIO_ANALYSIS_JOB_STATUSES).toEqual([
      'queued',
      'processing',
      'succeeded',
      'partial',
      'failed',
      'cancelled',
    ]);
    expect(AUDIO_ANALYSIS_OUTCOME_STATUSES).toEqual([
      'unknown',
      'partial',
      'complete',
      'failed',
    ]);
    expect(AUDIO_ANALYSIS_FAILURE_CODES).toEqual([
      'unsupported_format',
      'decode_failed',
      'analysis_timeout',
      'analyzer_failed',
    ]);
    expect(MUSICAL_KEY_TONICS).toHaveLength(12);
    expect(MUSICAL_KEY_MODES).toEqual(['major', 'minor']);
    expect(new Set(AUDIO_ANALYSIS_CAPABILITIES).size).toBe(
      AUDIO_ANALYSIS_CAPABILITIES.length
    );
    expect(new Set(AUDIO_ANALYSIS_JOB_STATUSES).size).toBe(
      AUDIO_ANALYSIS_JOB_STATUSES.length
    );
    expect(new Set(AUDIO_ANALYSIS_OUTCOME_STATUSES).size).toBe(
      AUDIO_ANALYSIS_OUTCOME_STATUSES.length
    );
    expect(new Set(AUDIO_ANALYSIS_FAILURE_CODES).size).toBe(
      AUDIO_ANALYSIS_FAILURE_CODES.length
    );
    expect(new Set(MUSICAL_KEY_TONICS).size).toBe(MUSICAL_KEY_TONICS.length);
  });

  it.each([
    ['C', 'major', 'C major', '8B', '1d'],
    ['C#', 'major', 'C# major', '3B', '8d'],
    ['D', 'major', 'D major', '10B', '3d'],
    ['D#', 'major', 'D# major', '5B', '10d'],
    ['E', 'major', 'E major', '12B', '5d'],
    ['F', 'major', 'F major', '7B', '12d'],
    ['F#', 'major', 'F# major', '2B', '7d'],
    ['G', 'major', 'G major', '9B', '2d'],
    ['G#', 'major', 'G# major', '4B', '9d'],
    ['A', 'major', 'A major', '11B', '4d'],
    ['A#', 'major', 'A# major', '6B', '11d'],
    ['B', 'major', 'B major', '1B', '6d'],
    ['C', 'minor', 'C minor', '5A', '10m'],
    ['C#', 'minor', 'C# minor', '12A', '5m'],
    ['D', 'minor', 'D minor', '7A', '12m'],
    ['D#', 'minor', 'D# minor', '2A', '7m'],
    ['E', 'minor', 'E minor', '9A', '2m'],
    ['F', 'minor', 'F minor', '4A', '9m'],
    ['F#', 'minor', 'F# minor', '11A', '4m'],
    ['G', 'minor', 'G minor', '6A', '11m'],
    ['G#', 'minor', 'G# minor', '1A', '6m'],
    ['A', 'minor', 'A minor', '8A', '1m'],
    ['A#', 'minor', 'A# minor', '3A', '8m'],
    ['B', 'minor', 'B minor', '10A', '3m'],
  ] as const)('normalizes %s %s into traditional, Camelot, and Open Key notation', (tonic, mode, traditional, camelot, openKey) => {
    expect(createCanonicalMusicalKey(tonic, mode)).toEqual({
      tonic,
      mode,
      traditional,
      camelot,
      openKey,
    });
  });

  it('rejects non-canonical musical key values at runtime boundaries', () => {
    expect(() =>
      createCanonicalMusicalKey('Db' as MusicalKeyTonic, 'major')
    ).toThrow(new RangeError('musical key tonic is not canonical'));
    expect(() =>
      createCanonicalMusicalKey('C', 'dorian' as MusicalKeyMode)
    ).toThrow(new RangeError('musical key mode is not canonical'));
  });
});

describe('analysis provenance and worker request contract', () => {
  it('normalizes hashes and preserves source identity without provider coupling', () => {
    expect(sha256ContentHash(` SHA256:${'AB'.repeat(32)} `)).toBe(CONTENT_HASH);
    expect(isoTimestamp(ANALYZED_AT)).toBe(ANALYZED_AT);
    expect(
      createAudioAnalysisProvenance({
        analyzerId: ' openkeyscan ',
        analyzerVersion: ' 1.0.0 ',
        modelId: ' key-model-v1 ',
        confidence: 0.75,
        analyzedAt: ANALYZED_AT,
        inputContentHash: CONTENT_HASH,
      })
    ).toEqual({
      analyzerId: 'openkeyscan',
      analyzerVersion: '1.0.0',
      modelId: 'key-model-v1',
      confidence: 0.75,
      analyzedAt: ANALYZED_AT,
      inputContentHash: CONTENT_HASH,
    });
    expect(
      createAudioAnalysisProvenance({
        analyzerId: 'essentia',
        analyzerVersion: '2.1',
        confidence: 0,
        analyzedAt: ANALYZED_AT,
        inputContentHash: CONTENT_HASH,
      }).modelId
    ).toBeNull();
    expect(analysisConfidence(1)).toBe(1);
  });

  it('creates a bounded, provider-neutral offline worker request', () => {
    const request = createAudioAnalysisJobRequest({
      assetId: ' asset_123 ',
      inputContentHash: CONTENT_HASH,
      capabilities: ['tempo', 'beat_grid', 'musical_key'],
      timeoutMs: 300_000,
      maxMemoryMb: 2_048,
      maxAttempts: 2,
    });

    expect(request).toEqual({
      assetId: 'asset_123',
      inputContentHash: CONTENT_HASH,
      capabilities: ['tempo', 'beat_grid', 'musical_key'],
      executionTarget: AUDIO_ANALYSIS_EXECUTION_TARGET,
      timeoutMs: 300_000,
      maxMemoryMb: 2_048,
      maxAttempts: 2,
    });
    expect(request.capabilities).not.toBe(AUDIO_ANALYSIS_CAPABILITIES);
  });

  it.each([
    ['', 'content hash must be a sha256-prefixed hex digest'],
    [
      `sha1:${'ab'.repeat(32)}`,
      'content hash must be a sha256-prefixed hex digest',
    ],
    [
      `sha256:${'zz'.repeat(32)}`,
      'content hash must be a sha256-prefixed hex digest',
    ],
    [
      `sha256:${'ab'.repeat(31)}`,
      'content hash must be a sha256-prefixed hex digest',
    ],
    [
      `prefix-sha256:${'ab'.repeat(32)}`,
      'content hash must be a sha256-prefixed hex digest',
    ],
    [
      `sha256:${'ab'.repeat(32)}-suffix`,
      'content hash must be a sha256-prefixed hex digest',
    ],
  ])('rejects an invalid content hash', (value, message) => {
    expect(() => sha256ContentHash(value)).toThrow(new TypeError(message));
  });

  it.each([
    '2026-07-22',
    '2026-07-22T20:15:30Z',
    'not-a-date',
  ])('rejects a non-canonical analysis timestamp', value => {
    expect(() => isoTimestamp(value)).toThrow(
      new TypeError('analysis timestamp must be canonical ISO-8601 UTC')
    );
  });

  it.each([
    -0.01,
    1.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects invalid analysis confidence %s', value => {
    expect(() => analysisConfidence(value)).toThrow(
      new RangeError('analysis confidence must be between 0 and 1')
    );
  });

  it('rejects missing analyzer identity and model metadata', () => {
    const base = {
      analyzerId: 'analyzer',
      analyzerVersion: '1',
      confidence: 1,
      analyzedAt: ANALYZED_AT,
      inputContentHash: CONTENT_HASH,
    };
    expect(() =>
      createAudioAnalysisProvenance({ ...base, analyzerId: ' ' })
    ).toThrow(new TypeError('analyzer id must not be empty'));
    expect(() =>
      createAudioAnalysisProvenance({ ...base, analyzerVersion: '' })
    ).toThrow(new TypeError('analyzer version must not be empty'));
    expect(() =>
      createAudioAnalysisProvenance({ ...base, modelId: ' ' })
    ).toThrow(new TypeError('model id must not be empty'));
  });

  it('rejects unbounded or ambiguous worker requests', () => {
    const base = {
      assetId: 'asset',
      inputContentHash: CONTENT_HASH,
      capabilities: ['tempo'] as readonly AudioAnalysisCapability[],
      timeoutMs: 1,
      maxMemoryMb: 1,
      maxAttempts: 1,
    };
    expect(() =>
      createAudioAnalysisJobRequest({ ...base, assetId: ' ' })
    ).toThrow(new TypeError('audio asset id must not be empty'));
    expect(() =>
      createAudioAnalysisJobRequest({ ...base, capabilities: [] })
    ).toThrow(new RangeError('analysis capabilities must not be empty'));
    expect(() =>
      createAudioAnalysisJobRequest({
        ...base,
        capabilities: ['tempo', 'tempo'],
      })
    ).toThrow(new RangeError('analysis capabilities must be unique'));
    expect(() =>
      createAudioAnalysisJobRequest({
        ...base,
        capabilities: ['lyrics' as AudioAnalysisCapability],
      })
    ).toThrow(new RangeError('analysis capability is not canonical'));
    expect(() =>
      createAudioAnalysisJobRequest({
        ...base,
        capabilities: ['tempo', 'lyrics' as AudioAnalysisCapability],
      })
    ).toThrow(new RangeError('analysis capability is not canonical'));
    expect(() =>
      createAudioAnalysisJobRequest({ ...base, timeoutMs: 0 })
    ).toThrow(new RangeError('analysis timeout must be a positive integer'));
    expect(() =>
      createAudioAnalysisJobRequest({ ...base, timeoutMs: 1.5 })
    ).toThrow(new RangeError('analysis timeout must be a positive integer'));
    expect(() =>
      createAudioAnalysisJobRequest({
        ...base,
        timeoutMs: AUDIO_ANALYSIS_MAX_TIMEOUT_MS + 1,
      })
    ).toThrow(
      new RangeError(
        `analysis timeout must not exceed ${AUDIO_ANALYSIS_MAX_TIMEOUT_MS}`
      )
    );
    expect(() =>
      createAudioAnalysisJobRequest({ ...base, maxMemoryMb: 0 })
    ).toThrow(new RangeError('analysis memory must be a positive integer'));
    expect(() =>
      createAudioAnalysisJobRequest({
        ...base,
        maxMemoryMb: AUDIO_ANALYSIS_MAX_MEMORY_MB + 1,
      })
    ).toThrow(
      new RangeError(
        `analysis memory must not exceed ${AUDIO_ANALYSIS_MAX_MEMORY_MB}`
      )
    );
    expect(() =>
      createAudioAnalysisJobRequest({ ...base, maxAttempts: -1 })
    ).toThrow(
      new RangeError('analysis max attempts must be a positive integer')
    );
    expect(() =>
      createAudioAnalysisJobRequest({
        ...base,
        maxAttempts: AUDIO_ANALYSIS_MAX_ATTEMPTS + 1,
      })
    ).toThrow(
      new RangeError(
        `analysis max attempts must not exceed ${AUDIO_ANALYSIS_MAX_ATTEMPTS}`
      )
    );

    expect(
      createAudioAnalysisJobRequest({
        ...base,
        timeoutMs: AUDIO_ANALYSIS_MAX_TIMEOUT_MS,
        maxMemoryMb: AUDIO_ANALYSIS_MAX_MEMORY_MB,
        maxAttempts: AUDIO_ANALYSIS_MAX_ATTEMPTS,
      })
    ).toMatchObject({
      timeoutMs: AUDIO_ANALYSIS_MAX_TIMEOUT_MS,
      maxMemoryMb: AUDIO_ANALYSIS_MAX_MEMORY_MB,
      maxAttempts: AUDIO_ANALYSIS_MAX_ATTEMPTS,
    });
  });
});
