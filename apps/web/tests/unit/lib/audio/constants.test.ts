import { describe, expect, it } from 'vitest';

import {
  AUDIO_MAX_FILE_SIZE_BYTES,
  isSupportedAudioFile,
  parseAudioTitleFromFileName,
  resolveAudioUploadMime,
  validateAudioFile,
  validateAudioUpload,
} from '@/lib/audio/constants';

describe('audio constants', () => {
  it('accepts common audio mime types and extensions', () => {
    expect(
      isSupportedAudioFile({ name: 'track.mp3', type: 'audio/mpeg' })
    ).toBe(true);
    expect(isSupportedAudioFile({ name: 'track.wav', type: '' })).toBe(true);
  });

  it('rejects unsupported files with a named rule + CTA', () => {
    expect(
      validateAudioFile({ name: 'notes.txt', type: 'text/plain', size: 10 })
    ).toContain('MP3');
    const result = validateAudioUpload({
      name: 'notes.txt',
      type: 'text/plain',
      size: 10,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('audio.supported_types');
    expect(result.cta.action).toBe('pick_another');
  });

  it('rejects oversize files with a named rule + CTA', () => {
    const result = validateAudioUpload({
      name: 'huge.mp3',
      type: 'audio/mpeg',
      size: AUDIO_MAX_FILE_SIZE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('audio.max_file_size_bytes');
    expect(result.cta.action).toBe('compress');
  });

  it('accepts valid audio and parses titles', () => {
    expect(
      validateAudioUpload({ name: 'track.mp3', type: 'audio/mpeg', size: 1024 })
    ).toEqual({ ok: true });
    expect(parseAudioTitleFromFileName('Take_Me_Over-final.wav')).toBe(
      'Take Me Over final'
    );
  });

  describe('resolveAudioUploadMime', () => {
    it('returns the canonical MIME for a declared audio MIME', () => {
      expect(
        resolveAudioUploadMime({ name: 'track.mp3', type: 'audio/mpeg' })
      ).toBe('audio/mpeg');
      expect(
        resolveAudioUploadMime({ name: 'track.mp3', type: 'audio/mp3' })
      ).toBe('audio/mpeg');
      expect(
        resolveAudioUploadMime({ name: 'mix.wav', type: 'audio/x-wav' })
      ).toBe('audio/wav');
    });

    it('falls back to the extension for blank or octet-stream MIME', () => {
      expect(resolveAudioUploadMime({ name: 'track.mp3', type: '' })).toBe(
        'audio/mpeg'
      );
      expect(
        resolveAudioUploadMime({
          name: 'song.wav',
          type: 'application/octet-stream',
        })
      ).toBe('audio/wav');
    });

    it('rejects contradictory non-audio MIME even with a supported extension', () => {
      expect(
        resolveAudioUploadMime({ name: 'track.mp3', type: 'text/plain' })
      ).toBeNull();
    });

    it('rejects unsupported extensions and unknown blank MIME', () => {
      expect(
        resolveAudioUploadMime({ name: 'notes.txt', type: 'text/plain' })
      ).toBeNull();
      expect(
        resolveAudioUploadMime({ name: 'archive.zip', type: '' })
      ).toBeNull();
      expect(
        resolveAudioUploadMime({ name: 'no-extension', type: '' })
      ).toBeNull();
    });
  });
});
