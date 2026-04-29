import { describe, expect, it } from 'vitest';
import { buildProfileRailCards } from '@/features/profile/ProfileHomeRail';

describe('ProfileHomeRail', () => {
  it('orders smart cards tour first and caps the rail at three cards', () => {
    expect(
      buildProfileRailCards({
        latestReleaseVisible: true,
        hasUpcomingTourDates: true,
        hasPlaylistFallback: true,
        hasListenFallback: true,
      }).map(card => card.kind)
    ).toEqual(['tour', 'release', 'playlist']);
  });

  it('fills remaining cards from qualified release and fallback cards', () => {
    expect(
      buildProfileRailCards({
        latestReleaseVisible: true,
        hasUpcomingTourDates: false,
        hasPlaylistFallback: true,
        hasListenFallback: true,
      }).map(card => card.kind)
    ).toEqual(['release', 'playlist', 'listen']);
  });
});
