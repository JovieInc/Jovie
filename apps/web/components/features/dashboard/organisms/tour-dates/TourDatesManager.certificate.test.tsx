import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEntityPanelProvider } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  syncPending: false,
  disconnect: vi.fn(),
  remove: vi.fn(),
  loadTourDates: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadTourDates: mocks.loadTourDates,
}));

vi.mock('@/lib/queries', () => ({
  useDeleteTourDateMutation: () => ({
    mutateAsync: mocks.remove,
    isPending: false,
  }),
  useDisconnectBandsintownMutation: () => ({
    mutateAsync: mocks.disconnect,
    isPending: false,
  }),
  useSyncFromBandsintownMutation: () => ({
    mutateAsync: mocks.sync,
    isPending: mocks.syncPending,
  }),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('./TourDatesEmptyState', () => ({
  TourDatesEmptyState: ({
    hasApiKey,
    onConnected,
    onApiKeySaved,
  }: {
    hasApiKey: boolean;
    onConnected: (tourDates: TourDateViewModel[]) => void;
    onApiKeySaved: () => void;
  }) => (
    <section aria-label='Connect Bandsintown'>
      <p>{hasApiKey ? 'Key saved' : 'Key needed'}</p>
      <button type='button' onClick={onApiKeySaved}>
        Save Key
      </button>
      <button type='button' onClick={() => onConnected([manualDate])}>
        Connect Artist
      </button>
    </section>
  ),
}));

vi.mock('./TourDatesTable', () => ({
  TourDatesTable: ({
    tourDates,
    onEdit,
    onDelete,
    onSync,
    isSyncing,
  }: {
    tourDates: TourDateViewModel[];
    onEdit: (tourDate: TourDateViewModel) => void;
    onDelete: (id: string) => void;
    onSync?: () => void;
    isSyncing?: boolean;
  }) => (
    <ul aria-label='Tour dates'>
      {tourDates.map(tourDate => (
        <li key={tourDate.id}>
          <button type='button' onClick={() => onEdit(tourDate)}>
            {tourDate.venueName}
          </button>
          <button type='button' onClick={() => onDelete(tourDate.id)}>
            Delete {tourDate.venueName}
          </button>
        </li>
      ))}
      {onSync ? (
        <li>
          <button type='button' onClick={onSync} disabled={isSyncing}>
            Sync Table
          </button>
        </li>
      ) : null}
    </ul>
  ),
}));

vi.mock('./TourDateSidebar', () => ({
  TourDateSidebar: ({ tourDate }: { tourDate: TourDateViewModel }) => (
    <aside aria-label='Tour date detail'>{tourDate.venueName}</aside>
  ),
}));

import { TourDatesManager } from './TourDatesManager';

function createTourDate(
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel {
  return {
    id: 'tour-1',
    profileId: 'profile-1',
    externalId: 'bit-1',
    provider: 'bandsintown',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
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
    ticketUrl: null,
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const syncedDate = createTourDate();
const manualDate = createTourDate({
  id: 'tour-2',
  externalId: null,
  provider: 'manual',
  venueName: 'The Echo',
});

function RightPanelProbe() {
  return <div data-testid='global-right-rail'>{useRightPanel()}</div>;
}

function renderManager(
  props: Partial<{
    initialTourDates: TourDateViewModel[];
    connected: boolean;
    hasApiKey: boolean;
  }> = {}
) {
  const {
    initialTourDates = [syncedDate, manualDate],
    connected = true,
    hasApiKey = true,
  } = props;
  return render(
    <RightPanelProvider>
      <ChatEntityPanelProvider resetKey='profile-1'>
        <TourDatesManager
          profileId='profile-1'
          initialTourDates={initialTourDates}
          connectionStatus={{
            connected,
            hasApiKey,
            artistName: 'Test Artist',
            lastSyncedAt: null,
          }}
        />
        <RightPanelProbe />
      </ChatEntityPanelProvider>
    </RightPanelProvider>
  );
}

describe('TourDatesManager certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncPending = false;
  });

  it('syncs, reloads the dates and reports success', async () => {
    const user = userEvent.setup();
    mocks.sync.mockResolvedValue({ success: true, message: 'Synced 1 date' });
    mocks.loadTourDates.mockResolvedValue([manualDate]);
    const { container } = renderManager();

    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Synced 1 date')
    );
    expect(screen.queryByRole('button', { name: 'Brooklyn Bowl' })).toBeNull();
    expect(screen.getByRole('button', { name: 'The Echo' })).toBeVisible();
  });

  it('reports a rejected or unsuccessful sync without changing the list', async () => {
    const user = userEvent.setup();
    mocks.sync.mockResolvedValueOnce({
      success: false,
      message: 'Rate limited',
    });
    renderManager();

    await user.click(screen.getByRole('button', { name: 'Sync Table' }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Rate limited')
    );

    mocks.sync.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to sync tour dates')
    );
    expect(mocks.loadTourDates).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Brooklyn Bowl' })).toBeVisible();
  });

  it('disables every sync control while a sync is pending', async () => {
    mocks.syncPending = true;
    const { container } = renderManager();

    expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sync Table' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('confirms a disconnect, dropping synced dates and keeping manual ones', async () => {
    const user = userEvent.setup();
    mocks.disconnect.mockResolvedValue(undefined);
    renderManager();

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Disconnect Bandsintown?',
    });
    await expectNoA11yViolations(dialog);
    await user.click(
      within(dialog).getByRole('button', { name: 'Disconnect' })
    );

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Disconnected from Bandsintown'
      )
    );
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Brooklyn Bowl' })).toBeNull();
    expect(screen.getByRole('button', { name: 'The Echo' })).toBeVisible();
    expect(screen.queryByText('Test Artist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync Table' })).toBeNull();
  });

  it('keeps the connection when the disconnect is cancelled or fails', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      })
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.disconnect).not.toHaveBeenCalled();

    mocks.disconnect.mockRejectedValueOnce(new Error('nope'));
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Disconnect',
      })
    );
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to disconnect')
    );
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('deletes a date optimistically and closes its open detail panel', async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue(undefined);
    renderManager();
    const rail = screen.getByTestId('global-right-rail');

    await user.click(screen.getByRole('button', { name: 'Brooklyn Bowl' }));
    expect(
      await within(rail).findByRole('complementary', {
        name: 'Tour date detail',
      })
    ).toHaveTextContent('Brooklyn Bowl');

    await user.click(
      screen.getByRole('button', { name: 'Delete Brooklyn Bowl' })
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete tour date?',
    });
    await expectNoA11yViolations(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Tour date deleted')
    );
    expect(mocks.remove).toHaveBeenCalledWith('tour-1');
    expect(screen.queryByRole('button', { name: 'Brooklyn Bowl' })).toBeNull();
    await waitFor(() =>
      expect(within(rail).queryByRole('complementary')).toBeNull()
    );
  });

  it('restores the date when the delete fails', async () => {
    const user = userEvent.setup();
    mocks.remove.mockRejectedValue(new Error('nope'));
    renderManager();

    await user.click(screen.getByRole('button', { name: 'Delete The Echo' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete',
      })
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Failed to delete tour date'
      )
    );
    expect(screen.getByRole('button', { name: 'The Echo' })).toBeVisible();
  });

  it('walks the connect flow from missing key to a connected table', async () => {
    const user = userEvent.setup();
    const { container } = renderManager({
      initialTourDates: [],
      connected: false,
      hasApiKey: false,
    });

    const connect = screen.getByRole('region', { name: 'Connect Bandsintown' });
    expect(connect).toHaveTextContent('Key needed');
    expect(screen.queryByTestId('tour-dates-manager')).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(
      screen.getByRole('region', { name: 'Connect Bandsintown' })
    ).toHaveTextContent('Key saved');

    await user.click(screen.getByRole('button', { name: 'Connect Artist' }));
    expect(screen.getByTestId('tour-dates-manager')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The Echo' })).toBeVisible();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('offers a sync from the connected no-dates message', async () => {
    const user = userEvent.setup();
    mocks.sync.mockResolvedValue({ success: true, message: 'Synced' });
    mocks.loadTourDates.mockResolvedValue([syncedDate]);
    const { container } = renderManager({ initialTourDates: [] });

    expect(screen.getByText('No upcoming tour dates')).toBeVisible();
    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Sync From Bandsintown' })
    );
    expect(
      await screen.findByRole('button', { name: 'Brooklyn Bowl' })
    ).toBeVisible();
  });
});
