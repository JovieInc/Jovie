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

  it('rejects unsupported files', () => {
    expect(
      validateAudioFile({ name: 'notes.txt', type: 'text/plain', size: 10 })
    ).toContain('MP3');
  });

  it('returns a named-rule rejection + CTA for unsupported types', () => {
    const result = validateAudioUpload({
      name: 'notes.txt',
      type: 'text/plain',
      size: 10,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('audio.supported_types');
    expect(result.rule).toMatch(/Supported types/i);
    expect(result.message).toMatch(/text\/plain/i);
    expect(result.cta.action).toBe('pick_another');
    expect(result.cta.label.length).toBeGreaterThan(0);
  });

  it('returns a named-rule rejection + CTA for oversize files', () => {
    const result = validateAudioUpload({
      name: 'huge.mp3',
      type: 'audio/mpeg',
      size: AUDIO_MAX_FILE_SIZE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('audio.max_file_size_bytes');
    expect(result.rule).toMatch(/Max file size/i);
    expect(result.cta.action).toBe('compress');
  });

  it('accepts valid audio uploads', () => {
    expect(
      validateAudioUpload({
        name: 'track.mp3',
        type: 'audio/mpeg',
        size: 1024,
      })
    ).toEqual({ ok: true });
  });

  it('parses a human title from the file name', () => {
    expect(parseAudioTitleFromFileName('Take_Me_Over-final.wav')).toBe(
      'Take Me Over final'
    );
  });
});
