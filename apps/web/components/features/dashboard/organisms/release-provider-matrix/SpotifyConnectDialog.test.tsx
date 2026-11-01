import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mockArtistSearch = vi.hoisted(() => vi.fn());
const mockConnectSpotifyArtist = vi.hoisted(() => vi.fn());
const mockSearch = vi.hoisted(() => vi.fn());
const mockSearchImmediate = vi.hoisted(() => vi.fn());
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
    <div role='dialog' aria-labelledby='spotify-dialog-title'>
      {children}
    </div>
  ),
  DialogActions: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => (
    <h2 id='spotify-dialog-title'>{children}</h2>
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DrawerSurfaceCard: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
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

const defaultResults = [otherClaimedArtist, currentUserArtist];

function mockSearchHook(overrides: Record<string, unknown> = {}) {
  mockArtistSearch.mockReturnValue({
    results: defaultResults,
    state: 'success',
    error: null,
    search: mockSearch,
    searchImmediate: mockSearchImmediate,
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
      {...props}
    />
  );
}

async function searchFor(query = 'tim white') {
  const user = userEvent.setup();
  const input = screen.getByRole('combobox', {
    name: 'Search Spotify artists or paste a link',
  });
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, query);
  return { user, input };
}

const get = (part: string) => screen.getByTestId(`spotify-connect-${part}`);
const getPrimary = () => get('primary');

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

  it('shows existing connection before search', async () => {
    const { container } = renderDialog({
      connected: true,
      connectedArtistName: 'Tim White',
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeVisible();

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Connect Spotify');
    expect(getPrimary()).toHaveTextContent('Done');
    await userEvent.click(get('change'));
    expect(screen.getByRole('combobox')).toHaveValue('Tim White');
    expect(mockSearch).toHaveBeenCalledWith('Tim White');
    await expectNoA11yViolations(container);
  }, 15_000);

  it('waits for parent connection resolution', async () => {
    const { container } = renderDialog({ connected: undefined });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { busy: true })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(
      screen.queryByTestId('spotify-connect-primary')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  }, 15_000);

  it('requires a selection before connecting', async () => {
    const { container } = renderDialog();

    const { user, input } = await searchFor('tim white');

    expect(input).toHaveClass('h-11', 'sm:h-8');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'spotify-connect-keyboard-hints'
    );
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute(
      'aria-controls',
      screen.getByRole('listbox').id
    );
    expect(
      container.querySelector('p.sr-only[aria-live="polite"]')
    ).toHaveTextContent('2 artists');
    expect(getPrimary()).toBeDisabled();
    expect(getPrimary()).toHaveTextContent('Connect');
    expect(screen.getAllByRole('button', { name: /^Connect/ })).toEqual([
      getPrimary(),
    ]);

    await user.keyboard('{ArrowDown}{Enter}{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { selected: true }).id
    );
    expect(getPrimary()).toBeEnabled();
    expect(getPrimary()).toHaveTextContent('Connect Tim White');
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

  it.each([true, false])(
    'preserves connection outcome success=%s',
    async success => {
      mockConnectSpotifyArtist.mockResolvedValue({
        success,
        releases: [],
        artistName: 'Tim White',
        message: 'Could not connect artist',
      });
      const onOpenChange = vi.fn();
      const onConnected = vi.fn();
      renderDialog({ onOpenChange, onConnected });
      const { user } = await searchFor();
      await user.click(screen.getByRole('option', { name: /Tim White/ }));
      await user.click(getPrimary());
      if (success) {
        await waitFor(() =>
          expect(onConnected).toHaveBeenCalledWith([], 'Tim White')
        );
        expect(get('success')).toHaveTextContent('Connected');
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      } else {
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Could not connect artist'
        );
        expect(getPrimary()).toHaveTextContent('Connect Tim White');
        expect(getPrimary()).toBeEnabled();
      }
    }
  );

  it.each([
    ['4q3gSjK0mWw6E6YIulvwiq', true],
    ['not-an-id', false],
  ])('validates pasted Spotify artist id %s', async (id, valid) => {
    renderDialog();
    const { user } = await searchFor(`https://open.spotify.com/artist/${id}`);
    await user.click(getPrimary());
    if (valid) {
      await waitFor(() =>
        expect(mockConnectSpotifyArtist).toHaveBeenCalledWith(
          expect.objectContaining({ spotifyArtistId: id })
        )
      );
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Enter a valid Spotify artist URL'
      );
      expect(mockConnectSpotifyArtist).not.toHaveBeenCalled();
    }
  });

  it('preserves input across Escape and refresh', async () => {
    const { rerender } = renderDialog();

    const { user, input } = await searchFor('tim white');
    await user.keyboard('{ArrowUp}');

    mockSearchHook({
      results: [currentUserArtist],
    });
    rerender(
      <SpotifyConnectDialog open onOpenChange={vi.fn()} connected={false} />
    );

    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}{Tab}');
    await user.click(input);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(input).toHaveValue('tim white');
  }, 15_000);

  it.each(['loading', 'empty', 'error'])(
    'shows recoverable %s search state',
    async state => {
      mockSearchHook({
        results: [],
        state,
        error: "Couldn't reach Spotify. Try again.",
      });
      const { container } = renderDialog();
      const { user, input } = await searchFor('tim');
      expect(input).toBeEnabled();
      if (state === 'loading') {
        expect(screen.getByRole('status', { busy: true })).toHaveAttribute(
          'aria-busy',
          'true'
        );
      } else {
        expect(get('paste-hatch')).toHaveTextContent(
          'Paste a Spotify artist link'
        );
        if (state === 'empty')
          expect(screen.getByText("No artists match 'tim'.")).toBeVisible();
        else {
          expect(screen.getByRole('alert')).toHaveTextContent(
            "Couldn't reach Spotify. Try again."
          );
          const retry = get('retry');
          await user.tab();
          expect(retry).toHaveFocus();
          await user.click(retry);
          expect(mockSearchImmediate).toHaveBeenCalledWith('tim');
        }
      }
      await expectNoA11yViolations(container);
    }
  );
});
