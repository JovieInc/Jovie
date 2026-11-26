import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingSpotifyArtistPickerCard } from '@/components/features/onboarding/OnboardingToolArtifacts';
import { fastRender } from '@/tests/utils/fast-render';

const mocks = vi.hoisted(() => ({
  artistSearch: {
    results: [] as Array<{
      id: string;
      name: string;
      url: string;
      imageUrl?: string;
      followers?: number;
      popularity: number;
    }>,
    state: 'idle',
    error: null as string | null,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
    query: '',
    isPending: false,
  },
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => mocks.artistSearch,
}));

describe('OnboardingSpotifyArtistPickerCard match guard', () => {
  beforeEach(() => {
    mocks.artistSearch.results = [];
    mocks.artistSearch.state = 'idle';
    mocks.artistSearch.error = null;
    mocks.artistSearch.search.mockClear();
    mocks.artistSearch.searchImmediate.mockClear();
    mocks.artistSearch.clear.mockClear();
    mocks.artistSearch.query = '';
    mocks.artistSearch.isPending = false;
  });

  it('offers None of These when artist results are present', () => {
    mocks.artistSearch.results = [
      {
        id: 'artist-1',
        name: 'Test Artist',
        url: 'https://open.spotify.com/artist/artist-1',
        followers: 12_300,
        popularity: 48,
      },
    ];
    const onNoneOfThese = vi.fn();
    fastRender(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: 'Test Artist' }}
        onSelectArtist={vi.fn()}
        onNoneOfThese={onNoneOfThese}
      />
    );

    // The list, search and None of These sit behind Not Me.
    expect(screen.queryByRole('button', { name: 'None of These' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Not Me' }));
    expect(screen.getByDisplayValue('Test Artist')).toBeDefined();
    expect(screen.getByText('Use')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'None of These' }));
    expect(onNoneOfThese).toHaveBeenCalled();
  });

  it('skips proposal and lists candidates when a lookalike tops the search', () => {
    mocks.artistSearch.results = [
      {
        id: 'lookalike',
        name: "Billie Eilish O'Connell",
        url: 'https://open.spotify.com/artist/lookalike',
        followers: 4_200,
        popularity: 12,
      },
      {
        id: 'billie',
        name: 'Billie Eilish',
        url: 'https://open.spotify.com/artist/billie',
        followers: 90_000_000,
        popularity: 100,
      },
    ];
    const onSelectArtist = vi.fn();
    const onNoneOfThese = vi.fn();
    fastRender(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: 'Billie Eilish' }}
        onSelectArtist={onSelectArtist}
        onNoneOfThese={onNoneOfThese}
      />
    );

    expect(screen.queryByTestId('onboarding-artist-confirm')).toBeNull();
    expect(screen.queryByText('Is This You?')).toBeNull();
    const picker = screen.getByTestId('onboarding-artist-picker');
    expect(picker.getAttribute('data-mode')).toBe('disambiguate');
    expect(picker.getAttribute('data-match-reason')).toBe(
      'lookalike_dominance'
    );
    expect(
      screen.getByText(/Several close matches — use followers/i)
    ).toBeDefined();
    expect(screen.getByText('Exact name · 90M followers')).toBeDefined();
    expect(screen.getAllByText('Use')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'None of These' }));
    expect(onNoneOfThese).toHaveBeenCalled();
    expect(onSelectArtist).not.toHaveBeenCalled();
  });

  it('keeps Not Me rejection from re-proposing the same top hit', () => {
    mocks.artistSearch.results = [
      {
        id: 'artist-1',
        name: 'Test Artist',
        url: 'https://open.spotify.com/artist/artist-1',
        followers: 12_300,
        popularity: 48,
      },
    ];
    fastRender(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: 'Test Artist' }}
        onSelectArtist={vi.fn()}
        onNoneOfThese={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Not Me' }));
    expect(screen.queryByText('Is This You?')).toBeNull();
    expect(
      screen.getByTestId('onboarding-artist-picker').getAttribute('data-mode')
    ).toBe('disambiguate');
    expect(screen.getByRole('button', { name: 'None of These' })).toBeDefined();
  });

  it('keeps the search field mounted while the artist name is typed', () => {
    fastRender(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: '' }}
        onSelectArtist={vi.fn()}
      />
    );
    // Prod 2026-11-01: the first keystroke swapped the field for the
    // proposal card, so every later keystroke was lost.
    mocks.artistSearch.isPending = true;
    const field = screen.getByPlaceholderText('Search Spotify artists');
    fireEvent.change(field, { target: { value: 'U' } });
    const after = screen.getByPlaceholderText('Search Spotify artists');
    fireEvent.change(after, { target: { value: 'Un' } });
    expect(
      screen.getByPlaceholderText('Search Spotify artists')
    ).toHaveProperty('value', 'Un');
  });
});
