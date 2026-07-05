import { describe, expect, it } from 'vitest';
import {
  clampScrubRatio,
  formatLibraryScrubTime,
  scrubRatioFromPointer,
} from '@/app/app/(shell)/library/library-thumbnail-utils';

describe('library thumbnail utils', () => {
  it('clamps scrub ratios into the 0-1 range', () => {
    expect(clampScrubRatio(-0.2)).toBe(0);
    expect(clampScrubRatio(0.42)).toBe(0.42);
    expect(clampScrubRatio(1.4)).toBe(1);
    expect(clampScrubRatio(Number.NaN)).toBe(0);
  });

  it('maps pointer position to a scrub ratio', () => {
    expect(
      scrubRatioFromPointer(60, {
        left: 40,
        width: 100,
      })
    ).toBe(0.2);
    expect(
      scrubRatioFromPointer(140, {
        left: 40,
        width: 100,
      })
    ).toBe(1);
  });

  it('formats scrub timestamps from duration and ratio', () => {
    expect(formatLibraryScrubTime(212_000, 0)).toBe('0:00');
    expect(formatLibraryScrubTime(212_000, 0.5)).toBe('1:46');
    expect(formatLibraryScrubTime(null, 0.25)).toBe('0:00');
  });
});
