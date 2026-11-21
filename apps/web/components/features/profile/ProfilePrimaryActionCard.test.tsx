import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
          releaseDate: '2026-08-01T12:00:00.000Z',
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

  it('keeps the listen card axe-clean on media-fixed colour tokens', async () => {
    const { container } = render(
      <ProfilePrimaryActionCard
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations
      />
    );

    const card = screen.getByTestId('profile-primary-action-card');
    expect(card.className).toContain('on-media');
    expect(card.className).not.toContain('white/');
    expect(card.className).not.toContain('black/');
    await expectNoA11yViolations(container);
  });

  it('plays from the card button when a play handler is supplied', async () => {
    const user = userEvent.setup();
    const onPlayClick = vi.fn();
    const { container } = render(
      <ProfilePrimaryActionCard
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations
        onPlayClick={onPlayClick}
      />
    );

    await user.click(screen.getByRole('button'));

    expect(onPlayClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders the next tour date with a sentence-case month label', async () => {
    const tourDate: TourDateViewModel = {
      id: 'tour-1',
      profileId: 'p',
      externalId: null,
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: null,
      title: null,
      startDate: '2099-03-14T20:00:00.000Z',
      startTime: null,
      timezone: null,
      venueName: 'The Echo',
      city: 'Los Angeles',
      region: 'CA',
      country: 'US',
      latitude: null,
      longitude: null,
      ticketUrl: 'https://tickets.example.com/echo',
      ticketStatus: 'available',
      lastSyncedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { container } = render(
      <ProfilePrimaryActionCard
        artist={PROFILE_STORY_ARTIST}
        tourDates={[tourDate]}
        hasPlayableDestinations={false}
      />
    );

    expect(screen.getByTestId('profile-primary-action-card')).toHaveAttribute(
      'data-state',
      'tour_next'
    );
    expect(screen.getByText('The Echo')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('uppercase');
    await expectNoA11yViolations(container);
  });
});
