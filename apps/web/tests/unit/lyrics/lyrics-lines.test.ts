import { describe, expect, it } from 'vitest';
import { plainLyricsToLines } from '@/app/app/(shell)/lyrics/[trackId]/lyrics-lines';

describe('plainLyricsToLines', () => {
  it('returns an empty list when lyrics are missing', () => {
    expect(plainLyricsToLines(null)).toEqual([]);
    expect(plainLyricsToLines('  ')).toEqual([]);
  });

  it('keeps only real lyric lines from stored plain text', () => {
    expect(plainLyricsToLines(' First line \n\nSecond line\r\n  ')).toEqual([
      { startSec: 0, text: 'First line' },
      { startSec: 0, text: 'Second line' },
    ]);
  });
});
