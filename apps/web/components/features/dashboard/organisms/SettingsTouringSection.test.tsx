import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsTouringSection } from './SettingsTouringSection';

const connection = vi.hoisted(() => ({
  current: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

const actions = vi.hoisted(() => ({
  connectBandsintownArtist: vi.fn(),
  disconnectBandsintown: vi.fn(),
  removeBandsintownApiKey: vi.fn(),
  saveBandsintownApiKey: vi.fn(),
  syncFromBandsintown: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => actions);

vi.mock('@/lib/queries', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    useBandsintownConnectionQuery: () => connection.current,
  };
});

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

const NOT_CONNECTED = {
  connected: false,
  artistName: null,
  lastSyncedAt: null,
  hasApiKey: false,
};

describe('SettingsTouringSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.current = {
      data: NOT_CONNECTED,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  });

  it('shows the not-connected row and opens the connect dialog', async () => {
    const user = userEvent.setup();
    const { container } = renderWithClient(
      <SettingsTouringSection profileId='p1' />
    );

    expect(screen.getByText('Bandsintown not connected')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Connect Bandsintown' })
    );
    expect(
      await screen.findByRole('dialog', { name: /Connect Bandsintown/ })
    ).toBeInTheDocument();
  });

  it('keeps typed dialog input across a rerender and submits the artist name', async () => {
    const user = userEvent.setup();
    actions.connectBandsintownArtist.mockResolvedValue({
      success: true,
      message: 'Connected',
    });
    const client = new QueryClient();
    const tree = (
      <QueryClientProvider client={client}>
        <SettingsTouringSection profileId='p1' />
      </QueryClientProvider>
    );
    const { rerender } = render(tree);

    await user.click(
      screen.getByRole('button', { name: 'Connect Bandsintown' })
    );
    const artist = await screen.findByLabelText('Artist Name');
    await user.type(artist, 'Sasha Waves');
    rerender(tree);
    await user.tab();

    expect(screen.getByLabelText('Artist Name')).toHaveValue('Sasha Waves');

    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(actions.connectBandsintownArtist).toHaveBeenCalledWith({
        artistName: 'Sasha Waves',
      })
    );
  });

  it('syncs from the connected pill menu', async () => {
    const user = userEvent.setup();
    actions.syncFromBandsintown.mockResolvedValue({
      success: true,
      message: 'Synced',
    });
    connection.current.data = {
      connected: true,
      artistName: 'Sasha Waves',
      lastSyncedAt: '2026-10-14T00:00:00.000Z',
      hasApiKey: true,
    };
    const { container } = renderWithClient(
      <SettingsTouringSection profileId='p1' />
    );

    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', {
        name: /Bandsintown connection: Sasha Waves/,
      })
    );
    await user.click(await screen.findByRole('menuitem', { name: /Sync now/ }));

    await waitFor(() => expect(actions.syncFromBandsintown).toHaveBeenCalled());
  });

  it('offers a retry when the connection status fails to load', async () => {
    const user = userEvent.setup();
    connection.current = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    };
    const { container } = renderWithClient(
      <SettingsTouringSection profileId='p1' />
    );

    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(connection.current.refetch).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('renders a skeleton while the status loads', async () => {
    connection.current = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    };
    const { container } = renderWithClient(
      <SettingsTouringSection profileId='p1' />
    );

    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
