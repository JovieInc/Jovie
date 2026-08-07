import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_PROFILE_SPEC_TILES } from '@/data/artistProfileFeatures';
import { HOMEPAGE_V2_POWER_TILES } from '@/data/homepageV2Copy';

/**
 * JOV-4865: the feature accent drives each tile's title color, so two tiles
 * sharing an accent render the same value where they should be independent.
 * Lock uniqueness for every rendered tile set.
 */
describe('marketing feature tile accents', () => {
  const cases = [
    ['artist profile spec tiles', ARTIST_PROFILE_SPEC_TILES],
    ['artist notifications spec tiles', ARTIST_NOTIFICATIONS_SPEC_TILES],
    ['homepage v2 power tiles', HOMEPAGE_V2_POWER_TILES],
  ] as const;

  it.each(cases)('%s use a distinct accent per tile', (_label, tiles) => {
    const accents = tiles.map(tile => tile.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });
});
