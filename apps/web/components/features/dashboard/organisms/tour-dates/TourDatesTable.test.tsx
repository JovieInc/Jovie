import { render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesTable } from './TourDatesTable';

const baseTourDate: TourDateViewModel = {
  id: 'td-1',
  profileId: 'profile-1',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: null,
  title: null,
  startDate: '2099-06-01T00:00:00.000Z',
  startTime: '8:00 PM',
  timezone: null,
  venueName: 'The Echo',
  city: 'Los Angeles',
  region: 'CA',
  country: 'US',
  latitude: null,
  longitude: null,
  ticketUrl: null,
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderTable(tourDates: TourDateViewModel[]) {
  return render(
    <TourDatesTable tourDates={tourDates} onEdit={vi.fn()} onDelete={vi.fn()} />
  );
}

describe('TourDatesTable', () => {
  it('gives the stacked date and time the two-line row budget', () => {
    renderTable([baseTourDate]);

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'two-line');
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('8:00 PM')).toBeInTheDocument();
  });

  it('uses the shared row hover instead of a local override', () => {
    renderTable([
      baseTourDate,
      {
        ...baseTourDate,
        id: 'td-past',
        venueName: 'The Roxy',
        startDate: '2001-01-01T00:00:00.000Z',
      },
    ]);

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    for (const row of rows.slice(1)) {
      expect(row.className).toContain('system-b-table-row-hover');
      expect(row.className).not.toMatch(/hover:bg-white/);
    }
    // Past shows stay readable but recede.
    expect(screen.getByText('The Roxy').closest('tr')?.className).toContain(
      'opacity-60'
    );
    expect(screen.getByText('The Echo').closest('tr')?.className).not.toContain(
      'opacity-60'
    );
  });

  it('renders the shared table empty state when there are no dates', () => {
    renderTable([]);

    const empty = screen.getByTestId('tour-dates-table-empty');
    expect(within(empty).getByText('No Tour Dates')).toBeInTheDocument();
  });

  it('renders no row as past on the server, so hydration cannot flip it', () => {
    const html = renderToString(
      <TourDatesTable
        tourDates={[{ ...baseTourDate, startDate: '2001-01-01T00:00:00.000Z' }]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(html).not.toContain('opacity-60');
    expect(html).not.toContain('>Past<');
  });
});
