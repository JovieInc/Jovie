import { describe, expect, it } from 'vitest';
import {
  ACCENT_ROTATION,
  getAccentCssVars,
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
});
