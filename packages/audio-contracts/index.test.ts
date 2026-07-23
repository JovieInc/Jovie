import { describe, expect, it } from 'vitest';
import {
  AUDIO_FILE_ACCEPT,
  AUDIO_FORMAT_IDS,
  AUDIO_FORMAT_REGISTRY,
  AUDIO_MAX_FILE_SIZE_BYTES,
  AUDIO_UPLOAD_POLICIES,
  bpm,
  getAudioFormat,
  getAudioFormatByFileName,
  getAudioFormatByMimeType,
  getAudioFormatLabel,
  getCanonicalAudioMimeType,
  getCanonicalAudioUploadMimeType,
  isSupportedAudioFile,
  isSupportedAudioMimeType,
  milliseconds,
  millisecondsToSeconds,
  percent,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_AUDIO_FORMAT_LABELS,
  SUPPORTED_AUDIO_MIME_TYPES,
  seconds,
  secondsToMilliseconds,
} from './index';

const EXPECTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
] as const;

const EXPECTED_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'aif',
  'aiff',
  'aac',
  'm4a',
] as const;

const EXPECTED_LABELS = ['MP3', 'WAV', 'FLAC', 'AIFF', 'AAC', 'M4A'] as const;

describe('audio format registry', () => {
  it('keeps every identifier, MIME alias, extension, and label unique', () => {
    expect(AUDIO_MAX_FILE_SIZE_BYTES).toBe(157_286_400);
    expect(SUPPORTED_AUDIO_MIME_TYPES).toEqual(EXPECTED_MIME_TYPES);
    expect(SUPPORTED_AUDIO_EXTENSIONS).toEqual(EXPECTED_EXTENSIONS);
    expect(SUPPORTED_AUDIO_FORMAT_LABELS).toEqual(EXPECTED_LABELS);
    expect(AUDIO_FILE_ACCEPT).toBe(
      `${EXPECTED_MIME_TYPES.join(',')},${EXPECTED_EXTENSIONS.map(extension => `.${extension}`).join(',')}`
    );
    expect(new Set(AUDIO_FORMAT_IDS).size).toBe(AUDIO_FORMAT_IDS.length);
    expect(new Set(SUPPORTED_AUDIO_MIME_TYPES).size).toBe(
      SUPPORTED_AUDIO_MIME_TYPES.length
    );
    expect(new Set(SUPPORTED_AUDIO_EXTENSIONS).size).toBe(
      SUPPORTED_AUDIO_EXTENSIONS.length
    );
    expect(new Set(SUPPORTED_AUDIO_FORMAT_LABELS).size).toBe(
      SUPPORTED_AUDIO_FORMAT_LABELS.length
    );
  });

  it.each(
    AUDIO_FORMAT_REGISTRY
  )('round-trips every $id MIME alias and extension', format => {
    expect(format.mimeTypes).toContain(format.canonicalMimeType);
    expect(format.uploadSurfaces).toEqual([
      'library',
      'chat',
      'promo_download',
    ]);
    expect(format.platforms).toEqual({
      web: true,
      desktop: true,
      ios: false,
    });

    for (const mimeType of format.mimeTypes) {
      expect(getAudioFormatByMimeType(mimeType)?.id).toBe(format.id);
      expect(isSupportedAudioMimeType(mimeType)).toBe(true);
      expect(getAudioFormatLabel(mimeType)).toBe(format.label);
      expect(AUDIO_FILE_ACCEPT).toContain(mimeType);
    }

    for (const extension of format.extensions) {
      const fileName = `TRACK.${extension.toUpperCase()}`;
      expect(getAudioFormatByFileName(fileName)?.id).toBe(format.id);
      expect(getCanonicalAudioMimeType(fileName)).toBe(
        format.canonicalMimeType
      );
      expect(isSupportedAudioFile({ name: fileName, type: '' })).toBe(true);
      expect(AUDIO_FILE_ACCEPT).toContain(`.${extension}`);
    }
  });

  it('normalizes parameterized MIME values and falls back to the extension', () => {
    expect(getAudioFormatByMimeType(' AUDIO/MPEG; charset=binary ')?.id).toBe(
      'mp3'
    );
    expect(
      getAudioFormat({ name: 'master.flac', type: 'application/octet-stream' })
        ?.id
    ).toBe('flac');
    expect(
      getAudioFormat({ name: 'notes.txt', type: 'application/octet-stream' })
    ).toBeNull();
    expect(getAudioFormat({ name: 'fake.mp3', type: 'text/plain' })).toBeNull();
    expect(getAudioFormatLabel('application/octet-stream')).toBe('Audio');
    expect(getAudioFormatByMimeType('')).toBeNull();
    expect(
      getAudioFormat({ name: 'no-extension', type: 'audio/mpeg' })?.id
    ).toBe('mp3');
    expect(getAudioFormatByFileName(' track.mp3 ')?.id).toBe('mp3');
    expect(getAudioFormatByFileName('track.mp3.exe')).toBeNull();
    expect(getAudioFormatByFileName('track')).toBeNull();
    expect(getCanonicalAudioMimeType('track')).toBeNull();
    expect(
      getCanonicalAudioUploadMimeType({ name: 'master.M4A', type: '' })
    ).toBe('audio/mp4');
    expect(
      getCanonicalAudioUploadMimeType({
        name: 'master.wav',
        type: 'audio/x-wav',
      })
    ).toBe('audio/wav');
    expect(
      getCanonicalAudioUploadMimeType({
        name: 'fake.mp3',
        type: 'text/plain',
      })
    ).toBeNull();
    expect(
      isSupportedAudioFile({ name: 'notes.txt', type: 'text/plain' })
    ).toBe(false);
  });

  it('uses one size and format policy on every upload surface', () => {
    for (const policy of Object.values(AUDIO_UPLOAD_POLICIES)) {
      expect(policy.maxFileSizeBytes).toBe(AUDIO_MAX_FILE_SIZE_BYTES);
      expect(policy.formatIds).toEqual(AUDIO_FORMAT_IDS);
    }
  });
});

describe('audio numeric units', () => {
  it('converts time units without losing meaning', () => {
    expect(milliseconds(0)).toBe(0);
    expect(seconds(0)).toBe(0);
    expect(millisecondsToSeconds(milliseconds(1_500))).toBe(1.5);
    expect(secondsToMilliseconds(seconds(1.5))).toBe(1_500);
  });

  it('accepts valid percentage and BPM boundaries', () => {
    expect(percent(0)).toBe(0);
    expect(percent(100)).toBe(100);
    expect(bpm(1)).toBe(1);
    expect(bpm(400)).toBe(400);
  });

  it.each([
    [
      () => milliseconds(-1),
      'milliseconds must be a finite, non-negative number',
    ],
    [
      () => seconds(Number.NaN),
      'seconds must be a finite, non-negative number',
    ],
    [() => percent(-0.1), 'percent must be between 0 and 100'],
    [() => percent(100.1), 'percent must be between 0 and 100'],
    [() => bpm(0), 'bpm must be greater than 0 and at most 400'],
    [() => bpm(401), 'bpm must be greater than 0 and at most 400'],
    [
      () => bpm(Number.POSITIVE_INFINITY),
      'bpm must be greater than 0 and at most 400',
    ],
  ] as const)('rejects invalid or ambiguous numeric values', (createValue, message) => {
    expect(createValue).toThrow(new RangeError(message));
  });
});
