import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { showToEntityCard } from '@/components/organisms/entity-card/adapters';
import { TourModePanel } from './TourModePanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({
    location: null,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useTourDateTicketClick', () => ({
  useTourDateTicketClick: () => () => undefined,
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: () => null,
  })
);

function makeTourDate(
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel {
  return {
    id: 'tour-1',
    profileId: 'artist-1',
    externalId: null,
    provider: 'manual',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: null,
    startDate: '2030-08-20T20:00:00.000Z',
    startTime: null,
    timezone: 'America/Los_Angeles',
    venueName: 'The Novo',
    city: 'Los Angeles',
    region: 'CA',
    country: 'US',
    latitude: null,
    longitude: null,
    ticketUrl: 'https://tickets.example.com/the-novo',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('TourModePanel', () => {
  it('shows the venue calendar day, matching the entity card (#18351)', () => {
    // 8pm PT on Jul 28 is Jul 29 in UTC.
    const show = makeTourDate({
      startDate: '2030-07-29T03:00:00.000Z',
      timezone: 'America/Los_Angeles',
    });
    render(<TourModePanel artist={PROFILE_STORY_ARTIST} tourDates={[show]} />);

    const list = screen.getByTestId('tour-drawer-list');
    expect(list).toHaveTextContent('Jul');
    expect(list).toHaveTextContent('28');
    expect(list).not.toHaveTextContent('29');

    const pill = showToEntityCard(show).datePill;
    expect(pill?.month).toBe('Jul');
    expect(pill?.day).toBe('28');
  });

  it('renders the upcoming show list with ticket links when dates exist', () => {
    render(
      <TourModePanel
        artist={PROFILE_STORY_ARTIST}
        tourDates={[makeTourDate()]}
      />
    );

    expect(screen.getByTestId('tour-drawer-list')).toBeInTheDocument();
    expect(screen.getByText('The Novo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tickets' })).toHaveAttribute(
      'href',
      'https://tickets.example.com/the-novo'
    );
  });

  it('keeps the empty state quiet and cardless with the alerts CTA as the single action', () => {
    render(<TourModePanel artist={PROFILE_STORY_ARTIST} tourDates={[]} />);

    expect(screen.getByTestId('tour-drawer-content')).toBeInTheDocument();
    expect(screen.getByText('No upcoming shows')).toBeInTheDocument();
    expect(screen.queryByTestId('tour-drawer-list')).not.toBeInTheDocument();
    expect(screen.queryByText('Latest release')).not.toBeInTheDocument();
    expect(screen.queryByText('Releases')).not.toBeInTheDocument();
  });
});
