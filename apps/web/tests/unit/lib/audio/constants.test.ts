import { describe, expect, it } from 'vitest';

import {
  isSupportedAudioFile,
  parseAudioTitleFromFileName,
  validateAudioFile,
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

  it('parses a human title from the file name', () => {
    expect(parseAudioTitleFromFileName('Take_Me_Over-final.wav')).toBe(
      'Take Me Over final'
    );
  });
});
