import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockArtistSearch = vi.hoisted(() => vi.fn());
const mockUseSpotifyConnect = vi.hoisted(() => vi.fn());
const mockHandleArtistSelect = vi.hoisted(() => vi.fn());
const mockSearch = vi.hoisted(() => vi.fn());
const mockClear = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: mockArtistSearch,
}));

vi.mock(
  '@/components/features/dashboard/organisms/release-provider-matrix/releases-empty-state/hooks/useSpotifyConnect',
  () => ({ useSpotifyConnect: mockUseSpotifyConnect })
);

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

import { SpotifyConnectDialog } from '@/components/features/dashboard/organisms/release-provider-matrix/SpotifyConnectDialog';

const otherClaimedArtist = {
  id: 'other-id',
  name: 'Other Owner',
  url: 'https://open.spotify.com/artist/other-id',
  popularity: 30,
  isClaimed: true,
};

const currentUserArtist = {
  id: 'current-id',
  name: 'Tim White',
  url: 'https://open.spotify.com/artist/current-id',
  popularity: 60,
  followers: 9900,
  isClaimed: true,
  isClaimedByCurrentUser: true,
};

function renderDialog() {
  render(
    <SpotifyConnectDialog open onOpenChange={vi.fn()} connected={false} />
  );
}

function getResultButton(name: string) {
  const button = screen
    .getAllByRole('option')
    .find(candidate => candidate.textContent?.includes(name));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing result button for ${name}`);
  }
  return button;
}

describe('SpotifyConnectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mockArtistSearch.mockReturnValue({
      results: [currentUserArtist, otherClaimedArtist],
      state: 'success',
      error: null,
      search: mockSearch,
      clear: mockClear,
    });
    mockUseSpotifyConnect.mockReturnValue({
      isPending: false,
      extractSpotifyArtistId: vi.fn(),
      connectFromUrl: vi.fn(),
      handleArtistSelect: mockHandleArtistSelect,
    });
  });

  it('selects the current user artist and connects only from the primary', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'tim white');

    expect(getResultButton('Tim White')).toBeEnabled();
    expect(getResultButton('Other Owner')).toBeDisabled();

    await user.click(getResultButton('Tim White'));
    expect(mockHandleArtistSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('spotify-connect-primary')).toHaveTextContent(
      'Connect Tim White'
    );

    await user.click(screen.getByTestId('spotify-connect-primary'));
    expect(mockHandleArtistSelect).toHaveBeenCalledWith(currentUserArtist);
  }, 15_000);

  it('selects with Enter, connects with a second Enter, and skips other owners', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'tim white');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(mockHandleArtistSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('spotify-connect-primary')).toHaveTextContent(
      'Connect Tim White'
    );

    await user.keyboard('{Enter}');
    expect(mockHandleArtistSelect).toHaveBeenCalledWith(currentUserArtist);

    mockHandleArtistSelect.mockClear();
    input.focus();
    const visited: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await user.keyboard('{ArrowDown}');
      visited.push(input.getAttribute('aria-activedescendant') ?? '');
    }
    // Navigation never lands on another owner's claimed row.
    expect(visited).not.toContain('spotify-connect-result-1');
    expect(mockHandleArtistSelect).not.toHaveBeenCalled();
  }, 15_000);

  it('keeps the primary disabled with no selectable result', async () => {
    const user = userEvent.setup();
    mockArtistSearch.mockReturnValue({
      results: [otherClaimedArtist],
      state: 'success',
      error: null,
      search: mockSearch,
      clear: mockClear,
    });
    renderDialog();

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'other owner');

    expect(screen.getByTestId('spotify-connect-primary')).toBeDisabled();
    expect(screen.getByTestId('spotify-connect-primary')).toHaveTextContent(
      'Connect'
    );
    expect(getResultButton('Other Owner')).toBeDisabled();
  });
});
