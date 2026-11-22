import { describe, expect, it } from 'vitest';
import {
  ACCENT_ROTATION,
  GREEN_RED_MIN_SET,
  getAccentCssVars,
  getRotationAccent,
  HUD_TONE_ACCENT,
  TASK_PRIORITY_ACCENT,
  TASK_STATUS_ACCENT,
} from '@/lib/ui/accent-palette';

describe('accent palette', () => {
  it('keeps the expected eight-color rotation order', () => {
    expect(ACCENT_ROTATION).toEqual([
      'gray',
      'blue',
      'purple',
      'pink',
      'red',
      'orange',
      'green',
      'teal',
    ]);
  });

  it('maps task statuses onto the shared accent palette', () => {
    expect(TASK_STATUS_ACCENT).toEqual({
      backlog: 'gray',
      todo: 'blue',
      in_progress: 'purple',
      done: 'green',
      cancelled: 'red',
    });
  });

  it('maps task priorities onto the shared accent palette', () => {
    expect(TASK_PRIORITY_ACCENT).toEqual({
      urgent: 'red',
      high: 'orange',
      medium: 'purple',
      low: 'teal',
      none: 'gray',
    });
  });

  it('maps HUD tones onto the shared accent palette', () => {
    expect(HUD_TONE_ACCENT).toEqual({
      good: 'green',
      warning: 'orange',
      bad: 'red',
      neutral: 'gray',
    });
  });

  it('returns CSS variable references for palette entries', () => {
    expect(getAccentCssVars('pink')).toEqual({
      solid: 'var(--color-accent-pink)',
      subtle: 'var(--color-accent-pink-subtle)',
    });
  });

  describe('getRotationAccent', () => {
    const run = (size: number) =>
      Array.from({ length: size }, (_, i) => getRotationAccent(i, size));

    it('keeps green and red out of sets below the threshold', () => {
      expect(GREEN_RED_MIN_SET).toBe(6);
      for (const size of [1, 2, 3, 4, 5]) {
        expect(run(size)).not.toContain('mint');
        expect(run(size)).not.toContain('red');
      }
    });

    it('wraps a 5-item set back to ion', () => {
      expect(run(5)).toEqual(['ion', 'ultra', 'pulse', 'orange', 'ion']);
    });

    it('reaches mint and red only in a set of 6 or more, in fixed order', () => {
      expect(run(6)).toEqual([
        'ion',
        'ultra',
        'pulse',
        'orange',
        'mint',
        'red',
      ]);
      expect(run(7)[6]).toBe('ion');
    });

    it('never repeats an accent on adjacent items', () => {
      for (const size of [2, 3, 4, 5, 6, 9]) {
        const accents = run(size);
        accents.slice(1).forEach((accent, i) => {
          expect(accent).not.toBe(accents[i]);
        });
      }
    });
  });
});
