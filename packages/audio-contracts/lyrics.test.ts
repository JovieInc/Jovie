import { describe, expect, it } from 'vitest';
import {
  findActiveTimedTextCueIndex,
  findActiveTimedTextWordIndex,
  getLyricsTimingStatus,
  isTimedTextCue,
  parseLyricsText as parseLyricsDocument,
} from './lyrics';

function parseLyricsText(input: string | null) {
  const { lines, timed } = parseLyricsDocument(input);
  return { lines, timed };
}

describe('canonical timed lyrics', () => {
  it('reports canonical provenance without inventing timing', () => {
    expect(parseLyricsDocument(null)).toEqual({
      lines: [],
      provenance: { format: 'plain', offsetMs: 0, timing: 'none' },
      timed: false,
    });
    expect(parseLyricsDocument('First line')).toMatchObject({
      provenance: { format: 'plain', offsetMs: 0, timing: 'none' },
      timed: false,
    });
    expect(
      parseLyricsDocument('[offset:250]\n[00:01.00]First line')
    ).toMatchObject({
      provenance: { format: 'lrc', offsetMs: 250, timing: 'line' },
      timed: true,
    });
    expect(parseLyricsDocument('[offset:250]\n[ar:Artist]')).toEqual({
      lines: [],
      provenance: { format: 'plain', offsetMs: 250, timing: 'none' },
      timed: false,
    });
  });

  it('parses enhanced LRC word timing into the canonical schema', () => {
    expect(
      parseLyricsDocument(
        '[offset:100]\n[00:01.00]<00:01.00>Hello <00:01.50>world'
      )
    ).toEqual({
      lines: [
        {
          startSec: 1.1,
          text: 'Hello world',
          words: [
            { startSec: 1.1, text: 'Hello' },
            { startSec: 1.6, text: 'world' },
          ],
        },
      ],
      provenance: {
        format: 'enhanced-lrc',
        offsetMs: 100,
        timing: 'word',
      },
      timed: true,
    });
  });

  it('falls back to line timing when enhanced word timing is incomplete or invalid', () => {
    const mixed = parseLyricsDocument(
      '[00:01.00]<00:01.00>Hello\n[00:02.00]Line only'
    );
    expect(mixed.provenance).toEqual({
      format: 'lrc',
      offsetMs: 0,
      timing: 'line',
    });
    expect(mixed.lines).toEqual([
      { startSec: 1, text: 'Hello' },
      { startSec: 2, text: 'Line only' },
    ]);
    expect(
      parseLyricsDocument('[00:02.00]<00:01.00>Early word').provenance
    ).toEqual({ format: 'lrc', offsetMs: 0, timing: 'line' });
    expect(
      parseLyricsDocument('[00:02.00]<00:01.00>Early <00:02.50>valid')
        .provenance
    ).toEqual({ format: 'lrc', offsetMs: 0, timing: 'line' });
    expect(
      parseLyricsDocument('[00:01.00][00:03.00]<00:01.00>Repeated line')
        .provenance
    ).toEqual({ format: 'lrc', offsetMs: 0, timing: 'line' });
  });

  it.each([
    '[00:01.00]<00:02.00>Later <00:01.00>Earlier',
    '[00:01.00]<00:01.00><00:02.00>Missing word',
    '[00:01.00]<00:01.00>First <bad>Second',
    '[00:01.00]x00:01>Missing angle bracket',
  ])('does not activate malformed enhanced word timing: %s', input => {
    const parsed = parseLyricsDocument(input);
    expect(parsed.provenance.timing).toBe('line');
    expect(parsed.lines.every(line => line.words === undefined)).toBe(true);
  });

  it('accepts zero and duplicate enhanced word timestamps', () => {
    expect(
      parseLyricsDocument('[00:00.00]<00:00.00>Same <00:00.00>instant')
    ).toMatchObject({
      lines: [
        {
          startSec: 0,
          words: [
            { startSec: 0, text: 'Same' },
            { startSec: 0, text: 'instant' },
          ],
        },
      ],
      provenance: { format: 'enhanced-lrc', timing: 'word' },
    });
  });

  it('validates runtime cue structure and resolves the latest active timestamp', () => {
    expect(isTimedTextCue({ startSec: 0, text: 'Opening' })).toBe(true);
    expect(
      isTimedTextCue({
        startSec: 1,
        text: 'Hello world',
        words: [
          { startSec: 1, text: 'Hello' },
          { startSec: 1.5, text: 'world' },
        ],
      })
    ).toBe(true);
    expect(isTimedTextCue({ startSec: -1, text: 'Invalid' })).toBe(false);
    expect(
      isTimedTextCue({
        startSec: 2,
        text: 'Invalid words',
        words: [{ startSec: 1, text: 'Early' }],
      })
    ).toBe(false);

    const outOfOrder = [
      { startSec: 30, text: 'Later' },
      { startSec: 6, text: 'Opening' },
      { startSec: 18, text: 'Middle' },
    ];
    expect(findActiveTimedTextCueIndex(outOfOrder, 20)).toBe(2);
    expect(findActiveTimedTextCueIndex(outOfOrder, 5)).toBe(-1);
    expect(findActiveTimedTextCueIndex(outOfOrder, 6)).toBe(1);
    expect(findActiveTimedTextCueIndex(outOfOrder, 0)).toBe(-1);
    expect(findActiveTimedTextCueIndex(outOfOrder, -1)).toBe(-1);
    expect(findActiveTimedTextCueIndex(outOfOrder, Number.NaN)).toBe(-1);
    expect(
      findActiveTimedTextCueIndex(outOfOrder, Number.POSITIVE_INFINITY)
    ).toBe(-1);
    expect(
      findActiveTimedTextCueIndex(
        [
          { startSec: 18, text: 'Latest timestamp' },
          { startSec: 6, text: 'Earlier timestamp later in array' },
        ],
        20
      )
    ).toBe(0);
    expect(
      findActiveTimedTextCueIndex(
        [
          { startSec: 0, text: 'First' },
          { startSec: 0, text: 'Second' },
        ],
        0
      )
    ).toBe(1);
  });

  it('resolves enhanced words without inventing an active word', () => {
    const cue = {
      startSec: 1,
      text: 'Hello bright world',
      words: [
        { startSec: 1, text: 'Hello' },
        { startSec: 1.5, text: 'bright' },
        { startSec: 2, text: 'world' },
      ],
    };

    expect(findActiveTimedTextWordIndex(cue, 0.99)).toBe(-1);
    expect(findActiveTimedTextWordIndex(cue, 1)).toBe(0);
    expect(findActiveTimedTextWordIndex(cue, 1.75)).toBe(1);
    expect(findActiveTimedTextWordIndex(cue, 2)).toBe(2);
    expect(findActiveTimedTextWordIndex(cue, Number.NaN)).toBe(-1);
    expect(
      findActiveTimedTextWordIndex({ startSec: 1, text: 'Line only' }, 2)
    ).toBe(-1);
  });

  it.each([
    null,
    'cue',
    Object.assign(() => undefined, { startSec: 1, text: 'Callable cue' }),
    {},
    { startSec: '1', text: 'Wrong start type' },
    { startSec: Number.NaN, text: 'Non-finite start' },
    { startSec: 1, text: 42 },
    { startSec: 1, text: '   ' },
    { startSec: 1, text: 'Empty words', words: [] },
    { startSec: 1, text: 'Wrong words type', words: 'word' },
    { startSec: 1, text: 'Bad word', words: [null] },
    {
      startSec: 1,
      text: 'Bad word start',
      words: [{ startSec: '1', text: 'Word' }],
    },
    {
      startSec: 1,
      text: 'Non-finite word',
      words: [{ startSec: Number.POSITIVE_INFINITY, text: 'Word' }],
    },
    {
      startSec: 1,
      text: 'Bad word text',
      words: [{ startSec: 1, text: 42 }],
    },
    {
      startSec: 1,
      text: 'Blank word',
      words: [{ startSec: 1, text: '   ' }],
    },
    {
      startSec: 1,
      text: 'Words out of order',
      words: [
        { startSec: 2, text: 'Later' },
        { startSec: 1.5, text: 'Earlier' },
      ],
    },
  ])('rejects malformed runtime cue payload %#', value => {
    expect(isTimedTextCue(value)).toBe(false);
  });

  it('classifies empty, untimed, synced, and stale duration states', () => {
    expect(getLyricsTimingStatus(parseLyricsDocument(null), 180)).toBe('empty');
    expect(
      getLyricsTimingStatus(parseLyricsDocument('Plain lyrics'), 180)
    ).toBe('untimed');
    expect(
      getLyricsTimingStatus(parseLyricsDocument('[02:59.00]Last line'), 180)
    ).toBe('synced');
    expect(
      getLyricsTimingStatus(
        parseLyricsDocument('[03:01.00]Tolerance edge'),
        180
      )
    ).toBe('synced');
    expect(
      getLyricsTimingStatus(
        parseLyricsDocument('[00:01.00]Safe line\n[03:01.01]Stale line'),
        180
      )
    ).toBe('stale');
    expect(
      getLyricsTimingStatus(
        parseLyricsDocument('[00:01.00]<00:01.00>Safe <03:01.01>Stale word'),
        180
      )
    ).toBe('stale');
    expect(
      getLyricsTimingStatus(
        parseLyricsDocument(
          '[00:01.00]<00:01.00>Safe <03:01.00>Tolerance edge'
        ),
        180
      )
    ).toBe('synced');
    expect(
      getLyricsTimingStatus(
        parseLyricsDocument('[10:00.00]Unknown duration'),
        0
      )
    ).toBe('synced');
  });

  it('returns an untimed empty result for missing or metadata-only lyrics', () => {
    expect(parseLyricsText(null)).toEqual({ lines: [], timed: false });
    expect(parseLyricsText('  ')).toEqual({ lines: [], timed: false });
    expect(parseLyricsText('[ar:Artist]\n[ti:Title]\n[length:03:30]')).toEqual({
      lines: [],
      timed: false,
    });
  });

  it('normalizes plain text without inventing timing', () => {
    expect(parseLyricsText(' First line \n\nSecond line\r\n  ')).toEqual({
      lines: [
        { startSec: 0, text: 'First line' },
        { startSec: 0, text: 'Second line' },
      ],
      timed: false,
    });
  });

  it('parses, expands, and stably sorts canonical LRC timestamps', () => {
    expect(
      parseLyricsText(
        [
          '[ar:Bahamas]',
          '[01:02.500]Later line',
          '[00:05.5][00:35.05]Repeated line',
          '[00:00]Opening line',
          '[00:00.00]Second opening line',
        ].join('\n')
      )
    ).toEqual({
      lines: [
        { startSec: 0, text: 'Opening line' },
        { startSec: 0, text: 'Second opening line' },
        { startSec: 5.5, text: 'Repeated line' },
        { startSec: 35.05, text: 'Repeated line' },
        { startSec: 62.5, text: 'Later line' },
      ],
      timed: true,
    });
  });

  it('uses the final global offset and clamps cues before zero', () => {
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

  it('ignores malformed or non-finite offset metadata instead of rendering it as lyrics', () => {
    const nonFiniteOffset = `1${'0'.repeat(400)}`;
    expect(
      parseLyricsDocument(
        `[offset:not-a-number]\n[offset:${nonFiniteOffset}]\n[00:01.00]Opening`
      )
    ).toEqual({
      lines: [{ startSec: 1, text: 'Opening' }],
      provenance: { format: 'lrc', offsetMs: 0, timing: 'line' },
      timed: true,
    });
  });

  it('fails mixed and malformed timing closed to untimed readable text', () => {
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

  it('ignores blank timed rows without downgrading valid timed lyrics', () => {
    expect(parseLyricsText('[00:00.00]\n[00:01.00]First real line')).toEqual({
      lines: [{ startSec: 1, text: 'First real line' }],
      timed: true,
    });
  });

  it.each([
    ['[0:00]One minute digit', 0],
    ['[001:02]Three minute digits', 62],
    ['[00:03.1]Tenths', 3.1],
    ['[00:04.12]Hundredths', 4.12],
    ['[00:05.123]Milliseconds', 5.123],
    ['[00:06:25]Colon fraction', 6.25],
    ['[09:59]Digit boundaries', 599],
  ])('accepts canonical timestamp %s', (input, startSec) => {
    expect(parseLyricsText(input)).toEqual({
      lines: [{ startSec, text: input.slice(input.indexOf(']') + 1) }],
      timed: true,
    });
  });

  it.each([
    'x[00:01]Leading garbage',
    'x00:01]Leading garbage',
    '[0000:01]Too many minute digits',
    '[aa:01]Non-numeric minutes',
    '[/0:01]Character below zero',
    '[00]Missing colon',
    '[00:1]One second digit',
    '[00:001]Three second digits',
    '[00:60]Seconds out of range',
    '[00:aa]Non-numeric seconds',
    '[00:01.]Empty fraction',
    '[00:01.1234]Long fraction',
    '[00:01.a]Non-numeric fraction',
    '[00:01-1]Invalid separator',
    '[00:01 Missing close bracket',
    '[00:01X',
  ])('keeps malformed timestamp text readable: %s', input => {
    expect(parseLyricsText(input)).toEqual({
      lines: [{ startSec: 0, text: input }],
      timed: false,
    });
  });

  it('trims timed lyric text and keeps bracketed lyric text after a cue', () => {
    expect(
      parseLyricsText('  [00:01]  First  \n[00:02][verse] Second')
    ).toEqual({
      lines: [
        { startSec: 1, text: 'First' },
        { startSec: 2, text: '[verse] Second' },
      ],
      timed: true,
    });
  });

  it.each([
    '[offset:]\n[00:01]Line',
    '[offset:+]\n[00:01]Line',
    '[offset:1x]\n[00:01]Line',
    '[offset:x1]\n[00:01]Line',
    '[offset:1e2]\n[00:01]Line',
    '[offset: 1]\n[00:01]Line',
  ])('ignores malformed offset metadata without disabling valid timing: %s', input => {
    expect(parseLyricsDocument(input)).toEqual({
      lines: [{ startSec: 1, text: 'Line' }],
      provenance: { format: 'lrc', offsetMs: 0, timing: 'line' },
      timed: true,
    });
  });

  it.each([
    'x[offset:100]\n[00:01]Line',
    '[offset:100]x\n[00:01]Line',
    '[offset:100x\n[00:01]Line',
    'xxxxxxxx100]\n[00:01]Line',
  ])('fails partial offset tags closed as readable untimed lyrics: %s', input => {
    expect(parseLyricsText(input).timed).toBe(false);
  });

  it('accepts unsigned offsets', () => {
    expect(parseLyricsText('[offset:250]\n[00:01]Line')).toEqual({
      lines: [{ startSec: 1.25, text: 'Line' }],
      timed: true,
    });
  });

  it('recognizes metadata case-insensitively but not partial tags', () => {
    expect(
      parseLyricsText(
        '[al:Album]\n[AR:Artist]\n[au:Author]\n[by:Creator]\n[length:03:30]\n[re:Editor]\n[ti:Title]\n[ve:1]\n[00:01]Line'
      )
    ).toEqual({
      lines: [{ startSec: 1, text: 'Line' }],
      timed: true,
    });
    expect(parseLyricsText('x[ar:Artist]\n[00:01]Line').timed).toBe(false);
    expect(parseLyricsText('xar:Artist]\n[00:01]Line').timed).toBe(false);
    expect(parseLyricsText('[ar:Artist]x\n[00:01]Line').timed).toBe(false);
    expect(parseLyricsText('[x:Value]\n[00:01]Line').timed).toBe(false);
  });
});
