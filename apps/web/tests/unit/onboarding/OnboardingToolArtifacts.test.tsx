import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatGenreLabel,
  OnboardingArtistConfirmedCard,
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  OnboardingSpotifyArtistPickerCard,
} from '@/components/features/onboarding/OnboardingToolArtifacts';
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
  handleAvailability: {
    data: undefined as { available: boolean; error?: string } | undefined,
    isLoading: false,
    isFetching: false,
  },
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => mocks.artistSearch,
}));

vi.mock('@/lib/queries/useHandleAvailabilityQuery', () => ({
  useHandleAvailabilityQuery: () => mocks.handleAvailability,
}));

describe('onboarding tool artifacts', () => {
  beforeEach(() => {
    mocks.artistSearch.results = [];
    mocks.artistSearch.state = 'idle';
    mocks.artistSearch.error = null;
    mocks.artistSearch.search.mockClear();
    mocks.artistSearch.searchImmediate.mockClear();
    mocks.artistSearch.clear.mockClear();
    mocks.artistSearch.query = '';
    mocks.artistSearch.isPending = false;
    mocks.handleAvailability.data = undefined;
    mocks.handleAvailability.isLoading = false;
    mocks.handleAvailability.isFetching = false;
  });

  it('renders a real Spotify picker and sends the selected artist', () => {
    mocks.artistSearch.results = [
      {
        id: 'artist-1',
        name: 'Test Artist',
        url: 'https://open.spotify.com/artist/artist-1',
        followers: 12_300,
        popularity: 48,
      },
    ];

    const onSelectArtist = vi.fn();
    fastRender(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: 'Test Artist' }}
        onSelectArtist={onSelectArtist}
      />
    );

    expect(screen.getByTestId('onboarding-artist-picker')).toBeDefined();
    expect(screen.getByDisplayValue('Test Artist')).toBeDefined();
    expect(screen.getByText('Test Artist')).toBeDefined();
    expect(screen.getByText(/12\.3K followers/)).toBeDefined();
    expect(screen.queryByText('searchSpotifyArtist')).toBeNull();

    fireEvent.click(screen.getByText('Use'));

    expect(onSelectArtist).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artist-1',
        name: 'Test Artist',
      })
    );
  });

  it('renders confirmed Spotify data as a compact artifact', () => {
    fastRender(
      <OnboardingArtistConfirmedCard
        state='output-available'
        output={{
          action: 'spotify_artist_confirmed',
          spotifyArtistId: 'artist-1',
          artist: {
            id: 'artist-1',
            name: 'Test Artist',
            url: 'https://open.spotify.com/artist/artist-1',
            followers: 1_234,
            popularity: 42,
            genres: ['indie pop', 'alt'],
          },
        }}
      />
    );

    expect(screen.getByTestId('onboarding-artist-confirmed')).toBeDefined();
    expect(screen.getByText('Test Artist')).toBeDefined();
    expect(screen.getByTitle('1,234 Spotify followers')).toBeDefined();
    expect(screen.getByText('1,234 Spotify followers')).toBeDefined();
    expect(screen.getByText('1.2K')).toBeDefined();
    expect(screen.getByTitle('Popularity score: 42 out of 100')).toBeDefined();
    expect(screen.getByText('Popularity score: 42 out of 100')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('Genre: Indie Pop')).toBeDefined();
    expect(screen.getByText('Indie Pop')).toBeDefined();
    expect(screen.queryByText('confirmSpotifyArtist')).toBeNull();
  });

  it('formats genre labels without shouting', () => {
    expect(formatGenreLabel('progressive house')).toBe('Progressive House');
    expect(formatGenreLabel('alt-pop')).toBe('Alt-Pop');
  });

  it('does not render unsafe Spotify profile links', () => {
    fastRender(
      <OnboardingArtistConfirmedCard
        state='output-available'
        output={{
          action: 'spotify_artist_confirmed',
          spotifyArtistId: 'artist-1',
          artist: {
            id: 'artist-1',
            name: 'Test Artist',
            url: 'javascript:alert(1)',
            followers: 1_234,
            popularity: 42,
            genres: ['indie pop'],
          },
        }}
      />
    );

    expect(screen.queryByLabelText('Open Test Artist on Spotify')).toBeNull();
  });

  it('renders handle availability without leaking the tool name', () => {
    mocks.handleAvailability.data = { available: true };

    fastRender(
      <OnboardingHandleCheckCard
        state='output-available'
        output={{ action: 'check_handle', handle: 'testartist' }}
      />
    );

    expect(screen.getByText('@testartist is available')).toBeDefined();
    expect(screen.getByText('jov.ie/testartist')).toBeDefined();
    expect(screen.queryByText('checkHandle')).toBeNull();
  });

  it('renders proposed social links as reviewable artifacts', () => {
    fastRender(
      <OnboardingSocialLinkCard
        state='output-available'
        output={{
          action: 'propose_social_link',
          url: 'https://instagram.com/testartist',
        }}
      />
    );

    expect(screen.getByText('Link ready to attach')).toBeDefined();
    expect(screen.getByText('instagram.com')).toBeDefined();
    expect(screen.queryByText('proposeSocialLink')).toBeNull();
  });
});
