import { describe, expect, it } from 'vitest';
import { buildProfileRailCards } from '@/features/profile/ProfileHomeRail';

describe('ProfileHomeRail', () => {
  it('keeps the featured state first, then fills remaining cards in priority order', () => {
    expect(
      buildProfileRailCards({
        latestReleaseVisible: true,
        hasUpcomingTourDates: true,
        hasPlaylistFallback: true,
        hasListenFallback: true,
        featuredKind: 'tour_next',
      }).map(card => card.kind)
    ).toEqual(['tour', 'release', 'playlist']);
  });

  it('dedupes the featured card kind and caps the rail at three cards', () => {
    expect(
      buildProfileRailCards({
        latestReleaseVisible: true,
        hasUpcomingTourDates: true,
        hasPlaylistFallback: true,
        hasListenFallback: true,
        featuredKind: 'release_live',
      }).map(card => card.kind)
    ).toEqual(['release', 'tour', 'playlist']);
  });
});
