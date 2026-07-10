import { describe, expect, it } from 'vitest';

import {
  AUDIO_MAX_FILE_SIZE_BYTES,
  isSupportedAudioFile,
  parseAudioTitleFromFileName,
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
});
