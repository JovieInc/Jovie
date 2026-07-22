import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatEntityPanelProvider } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesManager } from './TourDatesManager';

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadTourDates: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useDeleteTourDateMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDisconnectBandsintownMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSyncFromBandsintownMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden>{name}</span>,
}));

vi.mock('./TourDatesEmptyState', () => ({
  TourDatesEmptyState: () => <div data-testid='tour-dates-empty-state' />,
}));

vi.mock('./TourDatesTable', () => ({
  TourDatesTable: ({
    tourDates,
    onEdit,
  }: {
    tourDates: TourDateViewModel[];
    onEdit: (tourDate: TourDateViewModel) => void;
  }) => (
    <div>
      {tourDates.map(tourDate => (
        <button
          key={tourDate.id}
          type='button'
          onClick={() => onEdit(tourDate)}
        >
          {tourDate.venueName}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./TourDateSidebar', () => ({
  TourDateSidebar: ({
    tourDate,
    onClose,
  }: {
    tourDate: TourDateViewModel;
    onClose: () => void;
  }) => (
    <aside aria-label='Tour date detail' data-testid='tour-date-right-rail'>
      <span>{tourDate.venueName}</span>
      <button type='button' onClick={onClose}>
        Close
      </button>
    </aside>
  ),
}));

const tourDate = {
  id: 'tour-1',
  profileId: 'profile-1',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: '2026-07-01T00:00:00.000Z',
  title: 'Summer Tour',
  startDate: '2030-07-21T20:00:00.000Z',
  startTime: '20:00',
  timezone: 'America/New_York',
  venueName: 'Brooklyn Bowl',
  city: 'Brooklyn',
  region: 'NY',
  country: 'USA',
  latitude: null,
  longitude: null,
  ticketUrl: 'https://example.com/tickets',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies TourDateViewModel;

function RightPanelProbe() {
  return <div data-testid='global-right-rail'>{useRightPanel()}</div>;
}

function Harness({ showManager = true }: { readonly showManager?: boolean }) {
  return (
    <RightPanelProvider>
      <ChatEntityPanelProvider resetKey='profile-1'>
        {showManager ? (
          <TourDatesManager
            profileId='profile-1'
            initialTourDates={[tourDate]}
            connectionStatus={{
              connected: true,
              hasApiKey: true,
              artistName: 'Test Artist',
              lastSyncedAt: null,
            }}
          />
        ) : null}
        <RightPanelProbe />
      </ChatEntityPanelProvider>
    </RightPanelProvider>
  );
}

describe('TourDatesManager shell rail', () => {
  it('opens the typed tour-date detail in the global rail from click or Enter', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const manager = screen.getByTestId('tour-dates-manager');
    const row = within(manager).getByRole('button', { name: 'Brooklyn Bowl' });

    row.focus();
    await user.keyboard('{Enter}');

    const globalRail = screen.getByTestId('global-right-rail');
    expect(
      await within(globalRail).findByRole('complementary', {
        name: 'Tour date detail',
      })
    ).toHaveTextContent('Brooklyn Bowl');
    expect(within(manager).queryByTestId('tour-date-right-rail')).toBeNull();
  });

  it('closes accessibly and clears the registered rail on unmount', async () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Brooklyn Bowl' }));

    const globalRail = screen.getByTestId('global-right-rail');
    fireEvent.click(
      await within(globalRail).findByRole('button', { name: 'Close' })
    );
    await waitFor(() => {
      expect(
        within(globalRail).queryByTestId('tour-date-right-rail')
      ).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Brooklyn Bowl' }));
    expect(
      await within(globalRail).findByTestId('tour-date-right-rail')
    ).toBeTruthy();

    rerender(<Harness showManager={false} />);
    await waitFor(() => {
      expect(
        within(globalRail).queryByTestId('tour-date-right-rail')
      ).toBeNull();
    });
  });
});
