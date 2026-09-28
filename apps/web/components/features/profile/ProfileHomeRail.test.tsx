import { render, screen, within } from '@testing-library/react';
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
  default: (props: { readonly alt: string; readonly src?: string | null }) => (
    <img alt='' src={props.src ?? undefined} />
  ),
}));

describe('ProfileHomeRail', () => {
  it('renders the PAC as the featured card ahead of the highlights carousel', () => {
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

    const carousel = screen.getByTestId('profile-home-carousel');
    const pacCard = screen.getByTestId('profile-pac');
    expect(carousel).toHaveAttribute('data-layout', 'profile-landscape');
    expect(pacCard).toHaveAttribute('data-presentation', 'featured');
    expect(carousel.contains(pacCard)).toBe(false);
    expect(pacCard.compareDocumentPosition(carousel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('caps secondary cards at two and counts the capture card toward the cap', () => {
    const releases = ['one', 'two', 'three'].map((slug, index) => ({
      id: `release-${index}`,
      title: `Release ${index}`,
      slug: `release-${slug}`,
      releaseType: 'single',
      releaseDate: '2026-01-01T00:00:00.000Z',
      artworkUrl: null,
      artistNames: ['DJ Test'],
      previewUrl: null,
    }));

    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
        releases={releases}
      />
    );

    // Capture occupies one of the two secondary slots.
    expect(screen.getAllByTestId('entity-card-music')).toHaveLength(1);
    expect(
      screen.getByTestId('profile-home-alerts-fallback-card')
    ).toBeInTheDocument();
  });

  it('shows up to two secondary cards when the capture card is not rendered', () => {
    const releases = ['one', 'two', 'three'].map((slug, index) => ({
      id: `release-${index}`,
      title: `Release ${index}`,
      slug: `release-${slug}`,
      releaseType: 'single',
      releaseDate: '2026-01-01T00:00:00.000Z',
      artworkUrl: null,
      artistNames: ['DJ Test'],
      previewUrl: null,
    }));

    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={true}
        showAlertsCard={false}
        releases={releases}
      />
    );

    expect(screen.getAllByTestId('entity-card-music')).toHaveLength(2);
    expect(
      screen.queryByTestId('profile-home-alerts-fallback-card')
    ).not.toBeInTheDocument();
  });

  it('drops the alerts fallback card when fan capture is unavailable', () => {
    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        tourDates={[]}
        hasPlayableDestinations={false}
        renderMode='preview'
        isSubscribed={false}
        showAlertsCard={false}
      />
    );

    expect(
      screen.queryByTestId('profile-home-alerts-fallback-card')
    ).not.toBeInTheDocument();
  });

  it('dates a late-night show in the venue timezone, not UTC', () => {
    render(
      <ProfileHomeRail
        artist={PROFILE_STORY_ARTIST}
        tourDates={[
          {
            id: 'show-1',
            profileId: 'artist-1',
            externalId: null,
            provider: 'manual',
            eventType: 'tour',
            confirmationStatus: 'confirmed',
            reviewedAt: null,
            title: 'Radius',
            startDate: '2030-09-24T03:00:00Z',
            startTime: null,
            timezone: 'America/Chicago',
            venueName: 'Radius',
            city: 'Chicago',
            region: 'IL',
            country: 'US',
            latitude: null,
            longitude: null,
            ticketUrl: 'https://tickets.example.com/radius',
            ticketStatus: 'available',
            lastSyncedAt: null,
            createdAt: '2026-08-14T00:00:00.000Z',
            updatedAt: '2026-08-14T00:00:00.000Z',
          },
        ]}
        hasPlayableDestinations={false}
        renderMode='preview'
        isSubscribed={false}
        showAlertsCard={false}
      />
    );

    const show = within(screen.getByTestId('entity-card-show'));
    expect(show.getByText('23')).toBeVisible();
    expect(show.queryByText('24')).toBeNull();
  });
});
