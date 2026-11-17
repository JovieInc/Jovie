import { describe, expect, it } from 'vitest';
import { parseHistoryWindows } from './windows';

describe('parseHistoryWindows', () => {
  it('keeps allowed windows in order, once each', () => {
    expect(parseHistoryWindows('30, 7,30,9,90')).toEqual([30, 7, 90]);
  });

  it('falls back when nothing valid is left', () => {
    expect(parseHistoryWindows(null)).toEqual([7, 30]);
    expect(parseHistoryWindows('abc,0,-7')).toEqual([7, 30]);
    expect(parseHistoryWindows('', [7])).toEqual([7]);
  });
});
