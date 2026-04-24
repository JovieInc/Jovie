import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TourDateCard } from '@/app/[username]/tour/TourDateCard';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { renderWithQueryClient } from '../utils/test-utils';

// The ticket-click hook uses useTrackingMutation; stub it so we don't need
// the analytics wiring in this narrow render test.
vi.mock('@/hooks/useTourDateTicketClick', () => ({
  useTourDateTicketClick: () => vi.fn(),
}));

function makeTourDate(
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel {
  return {
    id: 'td-1',
    profileId: 'profile-1',
    externalId: null,
    provider: 'manual',
    title: null,
    startDate: '2030-06-15T20:00:00.000Z',
    startTime: '20:00',
    timezone: 'America/New_York',
    venueName: 'The Venue',
    city: 'Brooklyn',
    region: 'NY',
    country: 'USA',
    latitude: null,
    longitude: null,
    ticketUrl: 'https://example.com/tickets',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TourDateCard — cancelled state', () => {
  it('hides the Add to Calendar button when the date is cancelled', () => {
    renderWithQueryClient(
      <TourDateCard
        tourDate={makeTourDate({ ticketStatus: 'cancelled' })}
        handle='testartist'
      />
    );

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add to calendar/i })
    ).not.toBeInTheDocument();
  });

  it('shows the Add to Calendar button for available dates', () => {
    renderWithQueryClient(
      <TourDateCard
        tourDate={makeTourDate({ ticketStatus: 'available' })}
        handle='testartist'
      />
    );

    expect(
      screen.getByRole('button', { name: /add to calendar/i })
    ).toBeInTheDocument();
  });

  it('shows the Add to Calendar button for sold-out dates (fans may still want the reminder)', () => {
    renderWithQueryClient(
      <TourDateCard
        tourDate={makeTourDate({ ticketStatus: 'sold_out' })}
        handle='testartist'
      />
    );

    expect(
      screen.getByRole('button', { name: /add to calendar/i })
    ).toBeInTheDocument();
  });
});
