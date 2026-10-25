import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { providerDialogReadsConnectionBeforeSearch } from '@/tests/utils/provider-dialog-connection';

const mockArtistSearch = vi.hoisted(() => vi.fn());
const mockConnectSpotifyArtist = vi.hoisted(() => vi.fn());
const mockSearch = vi.hoisted(() => vi.fn());
const mockClear = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: mockArtistSearch,
}));

vi.mock('@/lib/env-client', () => ({
  env: { IS_E2E: false },
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  connectSpotifyArtist: mockConnectSpotifyArtist,
}));

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => (
    <div role='dialog'>{children}</div>
  ),
  DialogActions: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/atoms/ProviderIcon', () => ({
  ProviderIcon: () => <span aria-hidden='true'>Spotify</span>,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt='' />,
}));

import { SpotifyConnectDialog } from './SpotifyConnectDialog';

const currentUserArtist = {
  id: 'current-id',
  name: 'Tim White',
  url: 'https://open.spotify.com/artist/current-id',
  followers: 9900,
  popularity: 60,
  isClaimed: true,
  isClaimedByCurrentUser: true,
};

const otherClaimedArtist = {
  id: 'other-id',
  name: 'Other Owner',
  url: 'https://open.spotify.com/artist/other-id',
  popularity: 30,
  isClaimed: true,
};

const defaultResults = [currentUserArtist, otherClaimedArtist];

function mockSearchHook(overrides: Record<string, unknown> = {}) {
  mockArtistSearch.mockReturnValue({
    results: defaultResults,
    state: 'success',
    error: null,
    search: mockSearch,
    clear: mockClear,
    ...overrides,
  });
}

function renderDialog(props: Record<string, unknown> = {}) {
  return render(
    <SpotifyConnectDialog
      open
      onOpenChange={vi.fn()}
      connected={false}
      connectedArtistName={null}
      {...props}
    />
  );
}

async function getFocusedCombobox() {
  const input = screen.getByRole('combobox', {
    name: 'Search Spotify artists or paste a link',
  });
  await waitFor(() => expect(input).toHaveFocus());
  return input;
}

function getPrimary() {
  return screen.getByTestId('spotify-connect-primary');
}

describe('SpotifyConnectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mockSearchHook();
    mockConnectSpotifyArtist.mockResolvedValue({
      success: true,
      importing: false,
      releases: [],
      artistName: 'Tim White',
    });
  });

  it('reads the connection state before rendering a search (DG-001)', async () => {
    const { container } = providerDialogReadsConnectionBeforeSearch(() =>
      renderDialog({ connected: true, connectedArtistName: 'Tim White' })
    );

    expect(getPrimary()).toHaveTextContent('Done');
    expect(getPrimary()).toHaveTextContent('Done');
    await expectNoA11yViolations(container);
  }, 15_000);

  it('shows the connection with followers and a change-artist escape', async () => {
    const user = userEvent.setup();
    const { container } = renderDialog({
      connected: true,
      connectedArtistName: 'Tim White',
      connectedFollowers: 9900,
    });

    expect(
      screen.getByTestId('spotify-connect-connected-name')
    ).toHaveTextContent('Tim White');
    expect(screen.getByText('9.9K followers')).toBeInTheDocument();

    const change = screen.getByTestId('spotify-connect-change');
    expect(change).toHaveTextContent('Change artist');
    await user.click(change);

    const input = await getFocusedCombobox();
    expect(input).toHaveValue('Tim White');
    expect(mockSearch).toHaveBeenCalledWith('Tim White');
    await expectNoA11yViolations(container);
  }, 15_000);

  it('keeps the artist search at the 24px target-size floor', async () => {
    const { container } = renderDialog();

    const input = await getFocusedCombobox();
    // The canonical Input atom carries the hit-target floor (h-11 / sm:h-8);
    // min-h-6 keeps the raw input at or above the 24px floor in every mode.
    expect(input).toHaveClass('min-h-6');
    expect(input).toHaveClass('sm:h-8');
    expect(input).toBeEnabled();
    await expectNoA11yViolations(container);
  }, 15_000);

  it('renders a resolving skeleton while the connection state is unknown', async () => {
    const { container } = renderDialog({ connected: undefined });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.queryByTestId('spotify-connect-primary')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  }, 15_000);

  it('keeps a single primary that is disabled until a selection exists (DG-005)', async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();

    const input = await getFocusedCombobox();
    await user.type(input, 'tim white');

    expect(getPrimary()).toBeDisabled();
    expect(getPrimary()).toHaveTextContent('Connect');
    expect(
      screen
        .getAllByRole('button')
        .filter(
          button =>
            button.textContent?.startsWith('Connect') && button !== getPrimary()
        )
    ).toHaveLength(0);

    await user.click(screen.getByRole('option', { name: /Tim White/ }));
    expect(getPrimary()).toBeEnabled();
    expect(getPrimary()).toHaveTextContent('Connect Tim White');
    await expectNoA11yViolations(container);
  }, 15_000);

  it('selecting via the primary connects and closes after success', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConnected = vi.fn();
    renderDialog({ onOpenChange, onConnected });

    const input = await getFocusedCombobox();
    await user.type(input, 'tim white');
    await user.click(screen.getByRole('option', { name: /Tim White/ }));
    await user.click(getPrimary());

    await waitFor(() =>
      expect(onConnected).toHaveBeenCalledWith([], 'Tim White')
    );
    expect(screen.getByTestId('spotify-connect-success')).toHaveTextContent(
      'Connected'
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), {
      timeout: 3000,
    });
  }, 15_000);

  it('keeps the selection and an inline error when connecting fails', async () => {
    mockConnectSpotifyArtist.mockResolvedValue({
      success: false,
      message: 'Could not connect artist',
    });
    const user = userEvent.setup();
    renderDialog();

    const input = await getFocusedCombobox();
    await user.type(input, 'tim white');
    await user.click(screen.getByRole('option', { name: /Tim White/ }));
    await user.click(getPrimary());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not connect artist');
    expect(getPrimary()).toHaveTextContent('Connect Tim White');
    expect(getPrimary()).toBeEnabled();
  }, 15_000);

  it('connects a pasted Spotify URL from the same input', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = await getFocusedCombobox();
    await user.type(
      input,
      'https://open.spotify.com/artist/4q3gSjK0mWw6E6YIulvwiq'
    );
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(mockConnectSpotifyArtist).toHaveBeenCalledWith(
        expect.objectContaining({
          spotifyArtistId: '4q3gSjK0mWw6E6YIulvwiq',
        })
      )
    );
  }, 15_000);

  it('names the failing rule for an invalid Spotify URL', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = await getFocusedCombobox();
    await user.type(input, 'https://open.spotify.com/artist/not-an-id');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid Spotify artist URL'
    );
    expect(mockConnectSpotifyArtist).not.toHaveBeenCalled();
  }, 15_000);

  it('keeps typed input across re-renders, Escape, and arriving results', async () => {
    const user = userEvent.setup();
    const { rerender, container } = renderDialog();

    const input = await getFocusedCombobox();
    await user.type(input, 'tim white');
    await user.keyboard('{Escape}');

    mockSearchHook({
      results: [...defaultResults, otherClaimedArtist],
    });
    rerender(
      <SpotifyConnectDialog open onOpenChange={vi.fn()} connected={false} />
    );

    expect(input).toHaveValue('tim white');
    expect(input).toHaveFocus();

    input.focus();
    await waitFor(() =>
      expect(
        within(container).getAllByTestId('spotify-connect-result')
      ).toHaveLength(3)
    );
    expect(input).toHaveValue('tim white');
  }, 15_000);

  it('shows loading, empty, and error states with the paste escape hatch', async () => {
    const user = userEvent.setup();

    mockSearchHook({ results: [], state: 'loading' });
    const loadingView = renderDialog();
    const loadingInput = await getFocusedCombobox();
    await user.type(loadingInput, 'tim');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(loadingInput).toBeEnabled();
    await expectNoA11yViolations(loadingView.container);
    loadingView.unmount();

    mockSearchHook({ results: [], state: 'empty' });
    const noMatchView = renderDialog();
    const noMatchInput = await getFocusedCombobox();
    await user.type(noMatchInput, 'zzz');
    expect(screen.getByText("No artists match 'zzz'.")).toBeInTheDocument();
    expect(screen.getByTestId('spotify-connect-paste-hatch')).toHaveTextContent(
      'Paste a Spotify artist link'
    );
    await expectNoA11yViolations(noMatchView.container);
    noMatchView.unmount();

    mockSearchHook({
      results: [],
      state: 'error',
      error: "Couldn't reach Spotify. Try again.",
    });
    const errorView = renderDialog();
    const errorInput = await getFocusedCombobox();
    await user.type(errorInput, 'tim');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't reach Spotify. Try again."
    );
    await expectNoA11yViolations(errorView.container);

    mockSearch.mockClear();
    await user.click(screen.getByTestId('spotify-connect-retry'));
    expect(mockSearch).toHaveBeenCalledWith('tim');
  }, 15_000);

  it('goes offline with inputs kept and re-runs the query on reconnect', async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();

    const input = await getFocusedCombobox();
    await user.type(input, 'tim white');

    window.dispatchEvent(new Event('offline'));
    expect(
      await screen.findByText(/Your search will re-run when you reconnect/)
    ).toBeInTheDocument();
    expect(getPrimary()).toBeDisabled();
    expect(getPrimary()).toHaveTextContent("You're offline");
    expect(input).toHaveValue('tim white');

    mockSearch.mockClear();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('tim white'));
    expect(input).toHaveValue('tim white');
    await expectNoA11yViolations(container);
  }, 15_000);

  it('announces result counts for combobox semantics', async () => {
    const user = userEvent.setup();
    const { container } = renderDialog();

    const input = await getFocusedCombobox();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'spotify-connect-keyboard-hints'
    );

    await user.type(input, 'tim white');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', 'spotify-connect-results');
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-label',
      'Spotify Artist Results'
    );

    expect(
      container.querySelector('p.sr-only[aria-live="polite"]')
    ).toHaveTextContent('2 artists');
    await expectNoA11yViolations(container);
  }, 15_000);
});
