import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileHomeRail } from './ProfileHomeRail';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({
    location: null,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; src?: string | null }) => (
    <img alt='' src={props.src ?? undefined} />
  ),
}));

const RELEASE_BASE = {
  releaseType: 'single',
  artworkUrl: null,
  artistNames: ['Tim White'],
  previewUrl: null,
} as const;

describe('ProfileHomeRail', () => {
  it('renders the featured editorial card as the only card surface', () => {
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
        renderMode='preview'
        isSubscribed={false}
      />
    );

    const pacCard = screen.getByTestId('profile-pac');
    expect(pacCard).toHaveAttribute('data-presentation', 'featured');
    // JOV-7123: the editorial card replaces the highlights carousel — there
    // is no second card surface stacked underneath it.
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
    expect(
      screen.queryByTestId('profile-home-alerts-fallback-card')
    ).toBeNull();
  });

  it('renders nothing when the profile has no card subject', () => {
    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations={false}
        renderMode='preview'
        isSubscribed={false}
      />
    );

    expect(screen.queryByTestId('profile-pac')).toBeNull();
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
  });

  it('features the newest playable release, not a far-future one', () => {
    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        releases={[
          {
            ...RELEASE_BASE,
            id: 'future',
            title: 'Future Glow',
            slug: 'future-glow',
            releaseDate: '2036-11-30T00:00:00.000Z',
          },
          {
            ...RELEASE_BASE,
            id: 'out',
            title: 'Raw Energy',
            slug: 'raw-energy',
            releaseDate: '2024-06-01T00:00:00.000Z',
          },
        ]}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
      />
    );

    const pacCard = screen.getByTestId('profile-pac');
    expect(pacCard).toHaveTextContent('Raw Energy');
    expect(pacCard).not.toHaveTextContent('Future Glow');
    expect(screen.getByRole('link', { name: 'Listen now' })).toHaveAttribute(
      'href',
      expect.stringContaining('/raw-energy')
    );
  });

  it('never labels an unreleased-only subject as listenable', () => {
    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        releases={[
          {
            ...RELEASE_BASE,
            id: 'future',
            title: 'Future Glow',
            slug: 'future-glow',
            releaseDate: '2036-11-30T00:00:00.000Z',
          },
        ]}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
      />
    );

    expect(screen.queryByRole('link', { name: 'Listen now' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Coming soon' })).toBeTruthy();
  });
});
