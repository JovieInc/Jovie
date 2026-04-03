import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { TourModePanel } from '@/features/profile/TourModePanel';
import type { Artist } from '@/types/db';

const { replaceMock, ticketClickMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  ticketClickMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({ location: null }),
}));

vi.mock('@/hooks/useTourDateTicketClick', () => ({
  useTourDateTicketClick: () => ticketClickMock,
}));

const artist: Artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'timwhite',
  spotify_id: '4u',
  name: 'Tim White',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'Artist',
  theme: {},
  settings: { hide_branding: false },
  spotify_url: null,
  apple_music_url: null,
  youtube_url: null,
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2024-01-01T00:00:00Z',
};

const upcomingDate: TourDateViewModel = {
  id: 'tour-1',
  profileId: 'profile-1',
  externalId: null,
  provider: 'manual',
  title: null,
  startDate: '2026-05-01T00:00:00.000Z',
  startTime: null,
  timezone: null,
  venueName: 'The Echo',
  city: 'Los Angeles',
  region: 'CA',
  country: 'US',
  latitude: null,
  longitude: null,
  ticketUrl: 'https://tickets.example.com/tour-1',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

describe('TourModePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a clickable ticket link for available dates', () => {
    render(<TourModePanel artist={artist} tourDates={[upcomingDate]} />);

    const ticketLink = screen.getByRole('link', { name: 'Tickets' });
    expect(ticketLink).toHaveAttribute('href', upcomingDate.ticketUrl);

    fireEvent.click(ticketLink);
    expect(ticketClickMock).toHaveBeenCalledTimes(1);
  });

  it('does not render the placeholder filter label', () => {
    render(<TourModePanel artist={artist} tourDates={[upcomingDate]} />);

    expect(screen.queryByText('Filter')).not.toBeInTheDocument();
  });
});
