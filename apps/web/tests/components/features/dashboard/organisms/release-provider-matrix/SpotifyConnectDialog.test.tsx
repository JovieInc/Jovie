import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockArtistSearch = vi.hoisted(() => vi.fn());
const mockUseSpotifyConnect = vi.hoisted(() => vi.fn());
const mockHandleArtistSelect = vi.hoisted(() => vi.fn());
const mockConnectFromUrl = vi.hoisted(() => vi.fn());
const mockExtractSpotifyArtistId = vi.hoisted(() => vi.fn());

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
  followers: 9900,
  popularity: 60,
  isClaimed: true,
  isClaimedByCurrentUser: true,
};

function getResultOption(name: string) {
  const option = screen
    .getAllByTestId('spotify-connect-result')
    .find(candidate => candidate.textContent?.includes(name));
  if (!(option instanceof HTMLElement)) {
    throw new Error(`Missing result option for ${name}`);
  }
  return option;
}

function getPrimary() {
  return screen.getByTestId('spotify-connect-primary');
}

describe('SpotifyConnectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mockArtistSearch.mockReturnValue({
      results: [currentUserArtist, otherClaimedArtist],
      state: 'success',
      error: null,
      search: vi.fn(),
      clear: vi.fn(),
    });
    mockUseSpotifyConnect.mockReturnValue({
      isPending: false,
      extractSpotifyArtistId: mockExtractSpotifyArtistId,
      connectFromUrl: mockConnectFromUrl,
      handleArtistSelect: mockHandleArtistSelect,
    });
  });

  it('selects the current user artist and connects only from the primary', async () => {
    const user = userEvent.setup();
    render(
      <SpotifyConnectDialog open onOpenChange={vi.fn()} connected={false} />
    );

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'tim white');

    expect(getResultOption('Tim White')).toBeEnabled();
    expect(getResultOption('Other Owner')).toBeDisabled();

    await user.click(getResultOption('Tim White'));
    expect(mockHandleArtistSelect).not.toHaveBeenCalled();
    expect(getPrimary()).toHaveTextContent('Connect Tim White');

    await user.click(getPrimary());
    expect(mockHandleArtistSelect).toHaveBeenCalledWith(currentUserArtist);
  }, 15_000);

  it('selects with Enter, connects with a second Enter, and skips other owners', async () => {
    const user = userEvent.setup();
    render(
      <SpotifyConnectDialog open onOpenChange={vi.fn()} connected={false} />
    );

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'tim white');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(mockHandleArtistSelect).not.toHaveBeenCalled();
    expect(getPrimary()).toHaveTextContent('Connect Tim White');

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
      search: vi.fn(),
      clear: vi.fn(),
    });
    render(
      <SpotifyConnectDialog open onOpenChange={vi.fn()} connected={false} />
    );

    const input = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });
    await user.type(input, 'other owner');

    expect(getPrimary()).toBeDisabled();
    expect(getPrimary()).toHaveTextContent('Connect');
    expect(getResultOption('Other Owner')).toBeDisabled();
  });
});
