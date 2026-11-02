import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePrimaryActionCard } from './ProfilePrimaryActionCard';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({
    location: null,
    isLoading: false,
    error: null,
  }),
}));

describe('ProfilePrimaryActionCard', () => {
  it('renders the listen fallback card for an artist with playable destinations', () => {
    render(
      <ProfilePrimaryActionCard
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations
      />
    );

    const card = screen.getByTestId('profile-primary-action-card');
    expect(card).toHaveAttribute('data-state', 'listen_fallback');
    expect(card).toHaveTextContent('Tim White');
    expect(screen.getByText('Listen')).toBeInTheDocument();
  });

  it('renders the collaborator line through the canonical credit formatter', () => {
    render(
      <ProfilePrimaryActionCard
        artist={PROFILE_STORY_ARTIST}
        latestRelease={{
          title: 'Neon Hearts',
          slug: 'neon-hearts',
          artworkUrl: '/images/releases/neon-hearts.jpg',
          releaseDate: new Date(Date.now() - 5 * 86_400_000).toISOString(),
          releaseType: 'single',
          metadata: { artistNames: ['Tim White', 'Cosmic Gate', 'LYNX'] },
        }}
        tourDates={[]}
        hasPlayableDestinations={false}
      />
    );

    // ds-cert:credit-format: the profile card never joins credit names
    // locally — collaborators render as "w/ A and B".
    expect(screen.getByText('w/ Cosmic Gate and LYNX')).toBeInTheDocument();
  });

  it('renders nothing when no action state is eligible', () => {
    render(
      <ProfilePrimaryActionCard
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations={false}
      />
    );

    expect(
      screen.queryByTestId('profile-primary-action-card')
    ).not.toBeInTheDocument();
  });
});
