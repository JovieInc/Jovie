import { describe, expect, it } from 'vitest';
import {
  clampOutcomeIndex,
  getNearestOutcomeIndex,
} from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel.utils';

describe('ArtistProfileOutcomesCarousel utils', () => {
  it('chooses the first card when the viewport center is closest to card 0', () => {
    expect(
      getNearestOutcomeIndex(
        [
          { left: 0, width: 220 },
          { left: 260, width: 220 },
          { left: 520, width: 220 },
        ],
        0,
        280
      )
    ).toBe(0);
  });

  it('chooses the middle card when the viewport center is closest to it', () => {
    expect(
      getNearestOutcomeIndex(
        [
          { left: 0, width: 220 },
          { left: 260, width: 220 },
          { left: 520, width: 220 },
        ],
        240,
        280
      )
    ).toBe(1);
  });

  it('chooses the final card near the end of the rail', () => {
    expect(
      getNearestOutcomeIndex(
        [
          { left: 0, width: 220 },
          { left: 260, width: 220 },
          { left: 520, width: 220 },
        ],
        520,
        280
      )
    ).toBe(2);
  });

  it('clamps indices at the bounds of the rail', () => {
    expect(clampOutcomeIndex(-1, 4)).toBe(0);
    expect(clampOutcomeIndex(9, 4)).toBe(3);
  });
});
