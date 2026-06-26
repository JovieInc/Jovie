import { describe, expect, it } from 'vitest';
import {
  extractFirst30sHookText,
  parseJson3Captions,
  parseWebVtt,
} from '@/lib/services/packaging-intelligence/transcript';

const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:05.000
This is the opening hook.

00:00:05.000 --> 00:00:35.000
This line starts inside the first thirty seconds.

00:00:35.000 --> 00:00:40.000
This should be excluded from the hook window.
`;

describe('parseWebVtt', () => {
  it('parses timed caption segments from WebVTT', () => {
    const segments = parseWebVtt(SAMPLE_VTT);

    expect(segments).toEqual([
      {
        startSeconds: 0,
        durationSeconds: 5,
        text: 'This is the opening hook.',
      },
      {
        startSeconds: 5,
        durationSeconds: 30,
        text: 'This line starts inside the first thirty seconds.',
      },
      {
        startSeconds: 35,
        durationSeconds: 5,
        text: 'This should be excluded from the hook window.',
      },
    ]);
  });
});

describe('parseJson3Captions', () => {
  it('parses YouTube JSON3 caption events', () => {
    const segments = parseJson3Captions({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 2500,
          segs: [{ utf8: 'Hello ' }, { utf8: 'world' }],
        },
        { tStartMs: 2500, dDurationMs: 1500, segs: [{ utf8: 'again' }] },
      ],
    });

    expect(segments).toEqual([
      { startSeconds: 0, durationSeconds: 2.5, text: 'Hello world' },
      { startSeconds: 2.5, durationSeconds: 1.5, text: 'again' },
    ]);
  });
});

describe('extractFirst30sHookText', () => {
  it('returns only transcript text from the first 30 seconds', () => {
    const hookText = extractFirst30sHookText(parseWebVtt(SAMPLE_VTT));

    expect(hookText).toBe(
      'This is the opening hook. This line starts inside the first thirty seconds.'
    );
  });

  it('returns empty string when no segments fall inside the hook window', () => {
    const hookText = extractFirst30sHookText([
      { startSeconds: 40, durationSeconds: 5, text: 'Late start' },
    ]);

    expect(hookText).toBe('');
  });
});
