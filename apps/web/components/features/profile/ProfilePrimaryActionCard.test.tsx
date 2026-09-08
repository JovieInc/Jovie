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
