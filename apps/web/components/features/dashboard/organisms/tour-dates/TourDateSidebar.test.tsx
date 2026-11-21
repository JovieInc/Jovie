import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TourDateSidebar } from './TourDateSidebar';

const { mutateAsync, deleteAsync, analytics } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  deleteAsync: vi.fn(),
  analytics: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useUpdateTourDateMutation: () => ({ mutateAsync, isPending: false }),
  useDeleteTourDateMutation: () => ({
    mutateAsync: deleteAsync,
    isPending: false,
  }),
  useTourDateAnalyticsQuery: analytics,
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const tourDate: TourDateViewModel = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  profileId: 'profile_123',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: null,
  title: 'Summer Tour 2026',
  startDate: '2026-06-15T20:00:00Z',
  startTime: '8:00 PM',
  timezone: 'America/Los_Angeles',
  venueName: 'The Wiltern',
  city: 'Los Angeles',
  region: 'CA',
  country: 'USA',
  latitude: 34.05,
  longitude: -118.24,
  ticketUrl: 'https://ticketmaster.com/event/abc',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function ui(date: TourDateViewModel | null, onClose = vi.fn()) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <TourDateSidebar
        tourDate={date}
        profileId='profile_123'
        onClose={onClose}
      />
    </QueryClientProvider>
  );
}

describe('TourDateSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({});
    deleteAsync.mockResolvedValue({});
    analytics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

  it('shows the empty message when no tour date is selected', async () => {
    const { container } = render(ui(null));
    await expectNoA11yViolations(container);
  });

  it('changes the ticket status with the segmented buttons', async () => {
    const user = userEvent.setup();
    render(ui(tourDate));

    const soldOut = await screen.findByRole('button', { name: /sold out/i });
    await user.click(soldOut);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ ticketStatus: 'sold_out' })
      )
    );
  });

  it('keeps typed text across a parent re-render and saves it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(ui(tourDate, onClose));

    const city = (await screen.findByDisplayValue(
      'Los Angeles'
    )) as HTMLInputElement;
    await user.clear(city);
    await user.type(city, 'Pasadena');
    view.rerender(ui(tourDate, onClose));
    expect(screen.getByDisplayValue('Pasadena')).toHaveValue('Pasadena');
    await user.keyboard('{Escape}');
    expect(screen.getByDisplayValue('Pasadena')).toHaveValue('Pasadena');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Pasadena' })
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('has no axe violations while analytics load or fail', async () => {
    analytics.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container, rerender } = render(ui(tourDate));
    await screen.findByDisplayValue('Summer Tour 2026');
    await expectNoA11yViolations(container);

    analytics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    rerender(ui(tourDate));
    await expectNoA11yViolations(container);
  });
});
