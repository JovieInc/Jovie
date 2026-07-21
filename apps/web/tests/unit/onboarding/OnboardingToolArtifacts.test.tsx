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

  it('renders Spotify search failures as an actionable retry state', () => {
    mocks.artistSearch.error =
      'Request failed due to a temporary server issue. Please try again.';
    mocks.artistSearch.query = 'Test Artist';

    fastRender(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: 'Test Artist' }}
        onSelectArtist={vi.fn()}
      />
    );

    expect(screen.getByText('Spotify search is having trouble')).toBeDefined();
    expect(
      screen.getByText('Try again, or paste the Spotify artist link in chat.')
    ).toBeDefined();
    expect(screen.queryByText(/Request failed due/u)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mocks.artistSearch.searchImmediate).toHaveBeenCalledWith(
      'Test Artist'
    );
  });

  it('does not render a duplicate confirmed artist card after selection', () => {
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

    expect(screen.getByTestId('test-wrapper')).toBeEmptyDOMElement();
    expect(screen.queryByTestId('onboarding-artist-confirmed')).toBeNull();
    expect(screen.queryByText('Test Artist')).toBeNull();
    expect(screen.queryByText('confirmSpotifyArtist')).toBeNull();
  });

  it('does not render unsafe Spotify profile links from confirmed artist tools', () => {
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

    expect(screen.queryByLabelText('Open Test Artist on Spotify')).toBeNull();
  });

  it('formats genre labels without shouting', () => {
    expect(formatGenreLabel('progressive house')).toBe('Progressive House');
    expect(formatGenreLabel('alt-pop')).toBe('Alt-Pop');
  });

  it('renders picker and handle tools without card chrome', () => {
    mocks.artistSearch.results = [
      {
        id: 'artist-1',
        name: 'Test Artist',
        url: 'https://open.spotify.com/artist/artist-1',
        followers: 12_300,
        popularity: 48,
      },
    ];
    mocks.handleAvailability.data = { available: true };

    fastRender(
      <>
        <OnboardingSpotifyArtistPickerCard
          state='output-available'
          output={{ action: 'open_artist_picker', query: 'Test Artist' }}
          onSelectArtist={vi.fn()}
        />
        <OnboardingHandleCheckCard
          state='output-available'
          output={{ action: 'check_handle', handle: 'testartist' }}
        />
      </>
    );

    expect(screen.getByTestId('onboarding-artist-picker')).not.toHaveClass(
      'rounded-xl'
    );
    expect(screen.getByTestId('onboarding-artist-picker')).not.toHaveClass(
      'bg-surface-1'
    );
    expect(screen.getByTestId('onboarding-handle-check')).not.toHaveClass(
      'rounded-xl'
    );
    expect(screen.getByTestId('onboarding-handle-check')).not.toHaveClass(
      'bg-surface-1'
    );
  });

  it('does not render confirmed artist fallback cards for unsafe links', () => {
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

  it('renders editable handle availability without leaking the tool name', () => {
    mocks.handleAvailability.data = { available: true };
    const onHandleCandidateChange = vi.fn();

    fastRender(
      <OnboardingHandleCheckCard
        state='output-available'
        output={{ action: 'check_handle', handle: 'testartist' }}
        onHandleCandidateChange={onHandleCandidateChange}
      />
    );

    expect(screen.getByText('@testartist')).toBeDefined();
    expect(screen.getByText('is available')).toBeDefined();
    expect(screen.getByLabelText('Edit Proposed Handle')).toHaveValue(
      'testartist'
    );
    expect(screen.getByText('jov.ie/testartist')).toBeDefined();
    expect(screen.queryByText('checkHandle')).toBeNull();

    fireEvent.change(screen.getByLabelText('Edit Proposed Handle'), {
      target: { value: 'test' },
    });

    expect(onHandleCandidateChange).toHaveBeenLastCalledWith('test');

    fireEvent.change(screen.getByLabelText('Edit Proposed Handle'), {
      target: { value: '' },
    });

    expect(onHandleCandidateChange).toHaveBeenLastCalledWith('');
  });

  it('emits Confirm Handle widget event when the CTA is pressed', () => {
    mocks.handleAvailability.data = { available: true };
    const onConfirmHandle = vi.fn();

    fastRender(
      <OnboardingHandleCheckCard
        state='output-available'
        output={{ action: 'check_handle', handle: 'testartist' }}
        onConfirmHandle={onConfirmHandle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Handle' }));
    expect(onConfirmHandle).toHaveBeenCalledWith('testartist');
    expect(
      screen.getByRole('button', { name: 'Handle Confirmed' })
    ).toBeDefined();
  });

  it('renders proposed social links with Attach Account CTA', () => {
    const onAttachAccount = vi.fn();
    fastRender(
      <OnboardingSocialLinkCard
        state='output-available'
        output={{
          action: 'propose_social_link',
          url: 'https://instagram.com/testartist',
        }}
        onAttachAccount={onAttachAccount}
      />
    );

    expect(screen.getByText('Link ready to attach')).toBeDefined();
    expect(
      screen.getByDisplayValue('https://instagram.com/testartist')
    ).toBeDefined();
    expect(screen.queryByText('proposeSocialLink')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Attach Account' }));
    expect(onAttachAccount).toHaveBeenCalledWith(
      'https://instagram.com/testartist'
    );
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

    fireEvent.click(screen.getByRole('button', { name: 'None of These' }));
    expect(onNoneOfThese).toHaveBeenCalled();
  });
});
