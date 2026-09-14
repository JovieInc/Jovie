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

vi.mock('@jovie/ui', () => ({
  Spinner: ({ label }: { label?: string }) => (
    <span role='status'>{label}</span>
  ),
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
  render(<SpotifyConnectDialog open onOpenChange={vi.fn()} />);
}

function getResultButton(name: string) {
  const button = screen.getByText(name).closest('button');
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

  it('keeps the current user artist actionable while denying another owner', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'tim white');

    expect(getResultButton('Tim White')).toBeEnabled();
    expect(getResultButton('Other Owner')).toBeDisabled();

    await user.click(getResultButton('Tim White'));
    expect(mockHandleArtistSelect).toHaveBeenCalledWith(currentUserArtist);
  }, 15_000);

  it('uses the current user artist for the trailing action and keyboard Enter', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'tim white');

    await user.click(screen.getByRole('button', { name: 'Connect Spotify' }));
    expect(mockHandleArtistSelect).toHaveBeenCalledWith(currentUserArtist);

    mockHandleArtistSelect.mockClear();
    input.focus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(mockHandleArtistSelect).toHaveBeenCalledWith(currentUserArtist);

    mockHandleArtistSelect.mockClear();
    input.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      'spotify-connect-result-2'
    );
    expect(mockHandleArtistSelect).not.toHaveBeenCalled();
  }, 15_000);

  it('disables the trailing action when every claimed result belongs to someone else', async () => {
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

    expect(
      screen.getByRole('button', { name: 'Connect Spotify' })
    ).toBeDisabled();
    expect(getResultButton('Other Owner')).toBeDisabled();
  });
});
