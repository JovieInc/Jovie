import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    // The status badge is held, not shown as on sale, until the clock mounts.
    expect(html).toContain('class="invisible"');
  });

  it('shows the Past badge once the client clock mounts', () => {
    renderTable([{ ...baseTourDate, startDate: '2001-01-01T00:00:00.000Z' }]);

    const past = screen.getByText('Past');
    expect(past.closest('.invisible')).toBeNull();
  });
  it('opens a row for editing and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { container } = render(
      <TourDatesTable
        tourDates={[baseTourDate]}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByText('The Echo'));
    expect(onEdit).toHaveBeenCalledWith(baseTourDate);
    await expectNoA11yViolations(container);
  });

  it('syncs from the header without opening a row', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    const onEdit = vi.fn();
    const { container } = render(
      <TourDatesTable
        tourDates={[baseTourDate]}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onSync={onSync}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('disables sync while syncing', () => {
    render(
      <TourDatesTable
        tourDates={[baseTourDate]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        isSyncing
      />
    );
    expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();
  });

  it('labels each source and links tickets without opening the row', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <TourDatesTable
        tourDates={[
          {
            ...baseTourDate,
            provider: 'bandsintown',
            ticketUrl: 'https://example.com/tickets',
          },
          { ...baseTourDate, id: 'td-2', provider: 'songkick' },
          { ...baseTourDate, id: 'td-3', provider: 'admin_import' },
        ]}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Bandsintown')).toHaveClass('text-accent-teal');
    expect(screen.getByText('Songkick')).toHaveClass('text-accent-pink');
    expect(screen.getByText('Admin Import')).toHaveClass('text-warning-text');
    await user.click(screen.getByRole('link', { name: /Buy Tickets/ }));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('colors the Admin Import source with the warning text token', () => {
    renderTable([{ ...baseTourDate, provider: 'admin_import' }]);

    const source = screen.getByText('Admin Import');
    expect(source).toHaveClass('text-warning-text');
    expect(source.className).not.toMatch(/amber-\d/);
  });
});
