import { describe, expect, it } from 'vitest';
import {
  parseLyricsText as parseLyricsDocument,
  plainLyricsToLines,
} from '@/app/app/(shell)/lyrics/[trackId]/lyrics-lines';

function parseLyricsText(input: string | null) {
  const { lines, timed } = parseLyricsDocument(input);
  return { lines, timed };
}

describe('plainLyricsToLines', () => {
  it('preserves canonical timing provenance at the route boundary', () => {
    expect(
      parseLyricsDocument(
        '[offset:100]\n[00:01.00]<00:01.00>Hello <00:01.50>world'
      ).provenance
    ).toEqual({
      format: 'enhanced-lrc',
      offsetMs: 100,
      timing: 'word',
    });
  });

  it('returns an empty list when lyrics are missing', () => {
    expect(plainLyricsToLines(null)).toEqual([]);
    expect(plainLyricsToLines('  ')).toEqual([]);
  });

  it('keeps only real lyric lines from stored plain text', () => {
    expect(plainLyricsToLines(' First line \n\nSecond line\r\n  ')).toEqual([
      { startSec: 0, text: 'First line' },
      { startSec: 0, text: 'Second line' },
    ]);
    expect(parseLyricsText('First line\nSecond line')).toEqual({
      lines: [
        { startSec: 0, text: 'First line' },
        { startSec: 0, text: 'Second line' },
      ],
      timed: false,
    });
  });

  it('parses canonical LRC timestamps and sorts repeated cues stably', () => {
    expect(
      parseLyricsText(
        [
          '[ar:Bahamas]',
          '[ti:Lost in the Light]',
          '[01:02.500]Later line',
          '[00:05.5][00:35.05]Repeated line',
          '[00:00]Opening line',
        ].join('\n')
      )
    ).toEqual({
      lines: [
        { startSec: 0, text: 'Opening line' },
        { startSec: 5.5, text: 'Repeated line' },
        { startSec: 35.05, text: 'Repeated line' },
        { startSec: 62.5, text: 'Later line' },
      ],
      timed: true,
    });
  });

  it('applies the final LRC offset and never returns a negative cue', () => {
    expect(
      parseLyricsText(
        '[offset:-1500]\n[00:01.00]Opening\n[offset:+250]\n[00:02.00]Next'
      )
    ).toEqual({
      lines: [
        { startSec: 1.25, text: 'Opening' },
        { startSec: 2.25, text: 'Next' },
      ],
      timed: true,
    });
    expect(parseLyricsText('[offset:-2000]\n[00:01.00]Opening')).toEqual({
      lines: [{ startSec: 0, text: 'Opening' }],
      timed: true,
    });
  });

  it('fails mixed or malformed timing closed to readable untimed text', () => {
    expect(parseLyricsText('[00:01.00]Timed line\nUntimed line')).toEqual({
      lines: [
        { startSec: 0, text: 'Timed line' },
        { startSec: 0, text: 'Untimed line' },
      ],
      timed: false,
    });
    expect(parseLyricsText('[00:75.00]Malformed timestamp')).toEqual({
      lines: [{ startSec: 0, text: '[00:75.00]Malformed timestamp' }],
      timed: false,
    });
  });

  it('ignores metadata, blank timed rows, and metadata-only documents', () => {
    expect(parseLyricsText('[ar:Artist]\n[ti:Title]\n[length:03:30]')).toEqual({
      lines: [],
      timed: false,
    });
    expect(parseLyricsText('[00:00.00]\n[00:01.00]First real line')).toEqual({
      lines: [{ startSec: 1, text: 'First real line' }],
      timed: true,
    });
  });
});
