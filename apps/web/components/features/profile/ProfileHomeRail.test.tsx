import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PROFILE_HOME_SECONDARY_MODULE_CAP,
  ProfileHomeRail,
} from './ProfileHomeRail';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import type { PublicRelease } from './releases/types';

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
  it('renders the single highlights carousel with the PAC card leading', () => {
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
    expect(carousel).toHaveAttribute('data-layout', 'profile-landscape');
    expect(carousel.contains(screen.getByTestId('profile-pac'))).toBe(true);
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

  // JOV-6199 Wave 3 — editorial Home: at most one featured story/action
  // (the PAC card) plus two secondary modules; the trailing capture card
  // counts toward the secondary cap. Full catalog surfaces on Music.
  describe('editorial Home secondary-module cap (JOV-6199)', () => {
    const catalog: PublicRelease[] = [
      'Midnight Static',
      'Neon Circuit',
      'After Hours',
      'Rooftop Season',
    ].map((title, index) => ({
      id: `release-${index}`,
      title,
      slug: `release-${index}`,
      releaseType: 'single',
      releaseDate: `2026-0${index + 1}-01T00:00:00.000Z`,
      artworkUrl: null,
      artistNames: ['Tim White'],
    }));

    function countCatalogCards(): number {
      const carousel = screen.getByTestId('profile-home-carousel');
      const cards = carousel.querySelectorAll(
        '[data-testid^="entity-card-music"]'
      );
      return Array.from(cards).filter(
        card => !card.getAttribute('data-testid')?.includes('alerts')
      ).length;
    }

    it('exposes the locked secondary-module cap of two', () => {
      expect(PROFILE_HOME_SECONDARY_MODULE_CAP).toBe(2);
    });

    it('caps secondary catalog rows at one when the capture card renders', () => {
      const { container } = render(
        <ProfileHomeRail
          artist={PROFILE_STORY_ARTIST}
          tourDates={[]}
          hasPlayableDestinations
          renderMode='preview'
          isSubscribed={false}
          showAlertsCard
          releases={catalog}
        />
      );

      // Capture card renders (it counts toward the cap)…
      expect(
        screen.getByTestId('profile-home-alerts-fallback-card')
      ).toBeInTheDocument();
      // …so only one secondary catalog row remains inside the cap.
      expect(countCatalogCards()).toBe(1);
      expect(
        container.querySelectorAll('[data-testid^="entity-card-"]').length
      ).toBeLessThanOrEqual(2);
    });

    it('allows two secondary catalog rows when capture is unavailable', () => {
      render(
        <ProfileHomeRail
          artist={PROFILE_STORY_ARTIST}
          tourDates={[]}
          hasPlayableDestinations
          renderMode='preview'
          isSubscribed={false}
          showAlertsCard={false}
          releases={catalog}
        />
      );

      expect(
        screen.queryByTestId('profile-home-alerts-fallback-card')
      ).not.toBeInTheDocument();
      expect(countCatalogCards()).toBe(2);
    });

    it('never over-fills the rail when fewer releases exist than the cap', () => {
      render(
        <ProfileHomeRail
          artist={PROFILE_STORY_ARTIST}
          tourDates={[]}
          hasPlayableDestinations
          renderMode='preview'
          isSubscribed={false}
          showAlertsCard={false}
          releases={catalog.slice(0, 1)}
        />
      );

      expect(countCatalogCards()).toBe(1);
    });
  });
});
