import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { segmentedAccessibleName } from '@/tests/utils/accessible-name';
import { IngestProfileDropdown } from './IngestProfileDropdown';
import type { UseIngestProfileReturn } from './types';

const selectSpotifyArtistMock = vi.fn();
const setOpenMock = vi.fn();
let hookState: UseIngestProfileReturn;

vi.mock('./useIngestProfile', () => ({
  useIngestProfile: () => hookState,
}));

function buildHookState(
  overrides: Partial<UseIngestProfileReturn> = {}
): UseIngestProfileReturn {
  return {
    open: true,
    setOpen: setOpenMock,
    network: 'spotify',
    setNetwork: vi.fn(),
    inputValue: 'phoebe',
    setInputValue: vi.fn(),
    inputPlaceholder: 'Search Spotify artists',
    isLoading: false,
    isSuccess: false,
    detectedPlatform: null,
    spotifyResults: [
      {
        id: 'artist-1',
        name: 'Phoebe Bridgers',
        url: 'https://open.spotify.com/artist/2p89gzrWQ9x04sXIs2WnUm',
        popularity: 72,
      },
    ],
    spotifyState: 'success',
    spotifyError: null,
    selectSpotifyArtist: selectSpotifyArtistMock,
    handleSubmit: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('IngestProfileDropdown', () => {
  beforeEach(() => {
    selectSpotifyArtistMock.mockReset();
    setOpenMock.mockReset();
    hookState = buildHookState();
  });

  it('renders the Ingest Profile trigger while closed', () => {
    hookState = buildHookState({ open: false });
    render(<IngestProfileDropdown />);

    expect(
      screen.getByRole('button', { name: 'Ingest Profile' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Ingest social profile')).not.toBeInTheDocument();
  });

  it('renders Spotify results on the defined elevated surface token', () => {
    render(<IngestProfileDropdown />);

    const result = screen.getByRole('button', {
      name: segmentedAccessibleName('Phoebe Bridgers', 'Use'),
    });
    const resultsPanel = result.parentElement;
    expect(resultsPanel).toHaveClass('bg-surface-elevated');
    expect(resultsPanel).not.toHaveClass('bg-background-elevated');

    fireEvent.click(result);
    expect(selectSpotifyArtistMock).toHaveBeenCalledWith(
      hookState.spotifyResults[0]
    );
  });

  it('shows the empty-search recovery copy instead of results', () => {
    hookState = buildHookState({ spotifyState: 'empty', spotifyResults: [] });
    render(<IngestProfileDropdown />);

    expect(
      screen.getByText('No artists found. Try a different search.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: segmentedAccessibleName('Phoebe Bridgers', 'Use'),
      })
    ).not.toBeInTheDocument();
  });

  it('disables submit and cancel while an ingest is in flight', () => {
    hookState = buildHookState({ isLoading: true });
    render(<IngestProfileDropdown />);

    expect(screen.getByRole('button', { name: 'Ingesting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
