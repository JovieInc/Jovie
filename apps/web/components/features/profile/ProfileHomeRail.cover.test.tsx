import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileHomeRail } from './ProfileHomeRail';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({ location: null, isLoading: false, error: null }),
}));

describe('featured card cover (LCP element)', () => {
  it('is high priority with a fixed-size frame, so it never shifts layout', () => {
    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        latestRelease={{
          title: 'Never Say A Word',
          slug: 'never-say-a-word',
          artworkUrl: '/images/avatars/tim-white.jpg',
          releaseDate: '2026-08-01T00:00:00.000Z',
          releaseType: 'single',
        }}
        profileSettings={{ showOldReleases: true }}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='interactive'
        isSubscribed={false}
      />
    );
    const art = screen.getByTestId('profile-pac-featured-art');
    const img = art.querySelector('img');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
    expect(img?.getAttribute('loading')).not.toBe('lazy');
    // The frame, not the image, owns the size (fill layout inside a sized box).
    expect(img?.style.position).toBe('absolute');
  });
});
