import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SpotifyArtistResult } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HeroSpotifyResults } from './HeroSpotifyResults';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, unoptimized, ...rest } = props;
    return <img alt='' {...rest} />;
  },
}));

const ARTISTS: SpotifyArtistResult[] = [
  {
    id: 'artist-1',
    name: 'Taylor Swift',
    followers: 120_000_000,
    popularity: 100,
    url: 'https://open.spotify.com/artist/artist-1',
    verified: true,
  },
  {
    id: 'artist-2',
    name: 'Taylor Dayne',
    popularity: 60,
    url: 'https://open.spotify.com/artist/artist-2',
    isClaimed: true,
  },
];

function renderResults(
  overrides: Partial<Parameters<typeof HeroSpotifyResults>[0]> = {}
) {
  const handlers = {
    onActiveIndexChange: vi.fn(),
    onSelectArtist: vi.fn(),
    onPasteUrl: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(
    <HeroSpotifyResults
      resultsId='hero-spotify-results'
      isEditorial={false}
      results={ARTISTS}
      state='success'
      isLoading={false}
      isInvalidQuery={false}
      activeIndex={-1}
      pasteUrlIndex={ARTISTS.length}
      totalItems={ARTISTS.length + 1}
      resultsListRef={createRef<HTMLDivElement>()}
      {...handlers}
      {...overrides}
    />
  );
  return { ...view, ...handlers };
}

describe('HeroSpotifyResults', () => {
  it('lists artists and selects one with a ghost button', async () => {
    const user = userEvent.setup();
    const { container, onSelectArtist, onActiveIndexChange } = renderResults();

    const row = screen.getByText('Taylor Swift').closest('button');
    expect(row).toHaveAttribute('type', 'button');
    expect(screen.getByText('120.0M followers')).toBeInTheDocument();
    expect(screen.getByTestId('verified-badge')).toBeInTheDocument();
    expect(screen.getByTestId('listing-badge')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.hover(row as HTMLElement);
    expect(onActiveIndexChange).toHaveBeenCalledWith(0);
    await user.click(row as HTMLElement);
    expect(onSelectArtist).toHaveBeenCalledWith(ARTISTS[0]);
  });

  it('mirrors the results in a visually hidden host-drawn listbox', async () => {
    const user = userEvent.setup();
    const { onSelectArtist } = renderResults();

    const listbox = screen.getByRole('listbox', {
      name: 'Spotify Artist Results',
    });
    expect(listbox).toHaveAttribute('data-host-drawn');
    expect(listbox).toHaveClass('sr-only');
    await user.selectOptions(listbox, 'artist-2');
    expect(onSelectArtist).toHaveBeenCalledWith(ARTISTS[1]);
  });

  it('offers to paste a Spotify URL instead', async () => {
    const user = userEvent.setup();
    const { onPasteUrl } = renderResults({ results: [], pasteUrlIndex: 0 });

    await user.click(
      screen.getByRole('button', { name: /Paste a Spotify URL instead/ })
    );
    expect(onPasteUrl).toHaveBeenCalledTimes(1);
  });

  it('shows loading, empty, invalid and error states and retries a failed search', async () => {
    const user = userEvent.setup();
    const loading = renderResults({
      results: [],
      state: 'loading',
      isLoading: true,
      pasteUrlIndex: 0,
    });
    expect(loading.container.querySelectorAll('.animate-pulse')).toHaveLength(
      3
    );
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    const empty = renderResults({
      results: [],
      state: 'empty',
      pasteUrlIndex: 0,
    });
    expect(screen.getByText('No artists found')).toBeInTheDocument();
    empty.unmount();

    const invalid = renderResults({
      results: [],
      isInvalidQuery: true,
      pasteUrlIndex: 0,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Enter an artist name or paste a Spotify artist link.'
    );
    invalid.unmount();

    const failed = renderResults({
      results: [],
      state: 'error',
      pasteUrlIndex: 0,
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Search failed.');
    await expectNoA11yViolations(failed.container);
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(failed.onRetry).toHaveBeenCalledTimes(1);
  });
});
