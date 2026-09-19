import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroSpotifySearch } from '@/components/features/home/HeroSpotifySearch';
import { resolveStartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
import type { ArtistSearchState, SpotifyArtistResult } from '@/lib/queries';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// --- Mocks ---

const mockPush = vi.fn();
const mockTrack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  page: vi.fn(),
}));

const mockSearch = vi.fn();
const mockSearchImmediate = vi.fn();
const mockClear = vi.fn();
const mockHookReturn = {
  results: [] as SpotifyArtistResult[],
  state: 'idle' as ArtistSearchState,
  search: mockSearch,
  searchImmediate: mockSearchImmediate,
  clear: mockClear,
};

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => mockHookReturn,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, unoptimized, ...rest } = props;
    return <img alt='' {...rest} />;
  },
}));

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({
    platform,
    className,
  }: {
    platform: string;
    className?: string;
  }) => <span data-testid={`social-icon-${platform}`} className={className} />,
}));

// --- Fixtures ---

const ARTISTS: SpotifyArtistResult[] = [
  {
    id: 'artist-1',
    name: 'Taylor Swift',
    url: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
    imageUrl: 'https://i.scdn.co/image/taylor.jpg',
    followers: 95_000_000,
    popularity: 100,
    verified: true,
  },
  {
    id: 'artist-2',
    name: 'Phoebe Bridgers',
    url: 'https://open.spotify.com/artist/1r1uxoy19fzMxunt3ONAkG',
    followers: 3_500_000,
    popularity: 75,
    verified: false,
  },
  {
    id: 'artist-3',
    name: 'Bon Iver',
    url: 'https://open.spotify.com/artist/4LEiUm1SRbFMgfqnQTwUbQ',
    imageUrl: 'https://i.scdn.co/image/boniver.jpg',
    followers: 8_200_000,
    popularity: 80,
  },
];

// --- Helpers ---

function renderComponent() {
  return render(<HeroSpotifySearch />);
}

function getInput() {
  return screen.getByRole('combobox');
}

// --- Tests ---

describe('HeroSpotifySearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookReturn.results = [];
    mockHookReturn.state = 'idle';
    mockHookReturn.search = mockSearch;
    mockHookReturn.searchImmediate = mockSearchImmediate;
    mockHookReturn.clear = mockClear;
  });

  describe('rendering', () => {
    it('renders search input', () => {
      renderComponent();
      expect(getInput()).toBeInTheDocument();
    });

    it('renders sr-only label', () => {
      renderComponent();
      const label = screen.getByText('Search Spotify artists or paste a link');
      expect(label).toHaveClass('sr-only');
    });

    it('keeps the editorial accessible name aligned with its visible placeholder', () => {
      render(
        <HeroSpotifySearch
          appearance='editorial'
          placeholder='Search your name'
          submitLabel='Find me'
        />
      );

      expect(
        screen.getByPlaceholderText('Search your name')
      ).toHaveAccessibleName('Search your name');
    });

    it('uses the shared editorial aura treatment for homepage pills', () => {
      render(
        <HeroSpotifySearch
          appearance='editorial'
          placeholder='Search your name'
          submitLabel='Find me'
        />
      );

      const frame = document.querySelector('.input-aura-frame--editorial');
      expect(frame).toHaveAttribute('data-aura-treatment', 'editorial');
      expect(frame).not.toHaveClass('group/aura');
      expect(
        frame?.querySelector('.input-aura-frame__illumination')
      ).toBeInTheDocument();
    });

    it('renders combobox role on input', () => {
      renderComponent();
      expect(getInput()).toHaveAttribute('role', 'combobox');
    });

    it('keeps the homepage search focus indicator visible', () => {
      renderComponent();

      expect(getInput()).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:border-focus',
        'focus-visible:ring-2',
        'focus-visible:ring-focus/25',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-surface-page'
      );
    });

    it('namespaces result option ids per instance when rendered twice', async () => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
      // The homepage mounts this component in the hero and again in the
      // closing section; option ids must never collide across instances.
      render(
        <>
          <HeroSpotifySearch inputId='homepage-name-search' />
          <HeroSpotifySearch inputId='homepage-close-name-search' />
        </>
      );
      const [heroInput, closeInput] = screen.getAllByRole('combobox');
      const user = userEvent.setup();
      expect(heroInput).toHaveAttribute(
        'aria-controls',
        'homepage-name-search-results'
      );
      expect(closeInput).toHaveAttribute(
        'aria-controls',
        'homepage-close-name-search-results'
      );
      // Opening one instance closes the other (outside-pointer dismissal),
      // so assert each namespaced id set in turn.
      await user.type(heroInput, 'Taylor');
      expect(
        document.getElementById('homepage-name-search-results-result-0')
      ).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await user.type(closeInput, 'Taylor');
      expect(
        document.getElementById('homepage-close-name-search-results-result-0')
      ).toBeInTheDocument();
      expect(
        document.getElementById('homepage-name-search-results-result-0')
      ).not.toBeInTheDocument();
    });

    it('renders search icon when idle', () => {
      renderComponent();
      // Lucide Search icon renders as an SVG inside the input container
      const container = screen.getByRole('combobox').closest('div');
      expect(container?.querySelector('svg')).toBeInTheDocument();
    });

    it('keeps the canonical 20px search icon in the editorial field', () => {
      render(
        <HeroSpotifySearch
          appearance='editorial'
          placeholder='Search your name'
          submitLabel='Find me'
        />
      );

      const icon = document.querySelector('.homepage-name-search__icon');
      expect(icon).toHaveAttribute('width', '20');
      expect(icon).toHaveAttribute('height', '20');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('records the certified search-submit outcome without the query text', async () => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
      render(
        <HeroSpotifySearch
          appearance='editorial'
          placeholder='Search your name'
          submitLabel='Find me'
          submitAnalytics={{
            eventName: 'homepage_certified_search_submitted',
            properties: {
              variantIdentity:
                'homepage-certified:control-how-the-world-sees-you:v1',
              placement: 'hero',
            },
          }}
        />
      );
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      await user.click(screen.getByText('Taylor Swift'));

      expect(mockTrack).toHaveBeenCalledWith(
        'homepage_certified_search_submitted',
        expect.objectContaining({
          variantIdentity:
            'homepage-certified:control-how-the-world-sees-you:v1',
          placement: 'hero',
          hasArtistName: true,
        })
      );
      expect(JSON.stringify(mockTrack.mock.calls)).not.toContain('Taylor');
    });

    it('focuses the editorial input when its empty submit is clicked', async () => {
      render(
        <HeroSpotifySearch
          appearance='editorial'
          placeholder='Search your name'
          submitLabel='Find me'
        />
      );
      const user = userEvent.setup();
      const input = getInput();
      input.blur();

      await user.click(screen.getByRole('button', { name: 'Find me' }));

      expect(input).toHaveFocus();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('search interaction', () => {
    it.each([
      '/',
      '<script>',
      'x'.repeat(101),
      'https://open.spotify.com/artist/not-an-id',
      'https://open.spotify.com/track/06HL4z0CvFAxyc27GXpf02',
    ])(
      'explains invalid input without searching or selecting stale results: %s',
      value => {
        mockHookReturn.results = ARTISTS;
        mockHookReturn.state = 'success';
        render(
          <HeroSpotifySearch appearance='editorial' submitLabel='Find me' />
        );
        fireEvent.change(getInput(), { target: { value } });
        expect(getInput()).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('status')).toHaveTextContent(
          'Enter an artist name'
        );
        expect(mockSearch).not.toHaveBeenCalled();
        expect(mockClear).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Find me' }));
        fireEvent.keyDown(getInput(), { key: 'ArrowDown' });
        fireEvent.keyDown(getInput(), { key: 'Enter' });
        expect(mockPush).not.toHaveBeenCalled();
      }
    );

    it('recovers from invalid input when a valid name is entered', () => {
      renderComponent();
      fireEvent.change(getInput(), { target: { value: '/' } });
      fireEvent.change(getInput(), { target: { value: 'Beyoncé' } });
      expect(getInput()).not.toHaveAttribute('aria-invalid');
      expect(mockSearch).toHaveBeenLastCalledWith('Beyoncé');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('cancels pending name search when a Spotify link replaces it', () => {
      renderComponent();
      fireEvent.change(getInput(), { target: { value: 'Taylor' } });
      fireEvent.change(getInput(), { target: { value: ARTISTS[0].url } });
      expect(mockClear).toHaveBeenCalled();
      expect(getInput()).toHaveAttribute('aria-expanded', 'false');
    });

    it('calls search when typing', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      expect(mockSearch).toHaveBeenCalled();
    });

    it('shows dropdown when results are present', async () => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByText('Taylor Swift')).toBeInTheDocument();
    });

    it('shows loading skeleton', async () => {
      mockHookReturn.state = 'loading';
      mockHookReturn.results = [];
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'loading');
      // Loading skeleton renders 3 pulse placeholders inside the dropdown container
      const dropdown = screen.getByRole('listbox').closest('div')!;
      const pulseElements = dropdown.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBe(3);
    });

    it('shows empty state message when no results', async () => {
      mockHookReturn.state = 'empty';
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'xyznonexistent');
      expect(screen.getByText('No artists found')).toBeInTheDocument();
    });

    it('preserves the query and offers one immediate retry after an error', async () => {
      mockHookReturn.state = 'error';
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'tim white');

      expect(screen.getByRole('alert')).toHaveTextContent('Search failed.');
      await user.click(screen.getByRole('button', { name: 'Try Again' }));

      expect(mockSearchImmediate).toHaveBeenCalledTimes(1);
      expect(mockSearchImmediate).toHaveBeenCalledWith('tim white');
      expect(input).toHaveValue('tim white');
      expect(input).toHaveFocus();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('does not select placeholder results while a new search is loading', async () => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'loading';
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Phoebe');

      const staleResult = screen.getByText('Taylor Swift').closest('button');
      expect(staleResult).toBeDisabled();

      await user.keyboard('{ArrowDown}{Enter}');
      if (staleResult) fireEvent.click(staleResult);

      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows artist results after typing', async () => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      expect(screen.getByText('Taylor Swift')).toBeInTheDocument();
      expect(screen.getByText('Phoebe Bridgers')).toBeInTheDocument();
      expect(screen.getByText('Bon Iver')).toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    beforeEach(() => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
    });

    it('ArrowDown moves active index down', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        'hero-spotify-results-result-0'
      );
    });

    it('ArrowUp wraps to last item', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      // activeIndex starts at -1. ArrowUp should wrap to last (pasteUrlIndex = 3)
      await user.keyboard('{ArrowUp}');
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        'hero-spotify-results-result-3'
      );
    });

    it('Enter selects active artist', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/start?'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('spotify_url=')
      );
    });

    it('Escape closes dropdown', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      // Dropdown should be visible
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('Tab closes dropdown', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.tab();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('updates aria-activedescendant as user navigates', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      expect(input).not.toHaveAttribute('aria-activedescendant');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        'hero-spotify-results-result-0'
      );
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        'hero-spotify-results-result-1'
      );
    });
  });

  describe('artist selection', () => {
    beforeEach(() => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
    });

    it('click navigates to /start with spotify_url, artist_name, and starter prompt', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      await user.click(screen.getByText('Taylor Swift'));
      expect(mockPush).toHaveBeenCalledTimes(1);
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).toContain('/start?');
      expect(url).toContain('spotify_url=');
      expect(url).toContain('artist_name=Taylor+Swift');
      expect(url).toContain('starter_prompt=');
    });

    it('cancels search and emits one handoff for same-frame Enter and click', async () => {
      render(
        <HeroSpotifySearch
          submitAnalytics={{
            eventName: 'homepage_certified_search_submitted',
            properties: { placement: 'hero' },
          }}
        />
      );
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      await user.keyboard('{ArrowDown}');
      const artistButton = screen.getByText('Taylor Swift').closest('button');
      expect(artistButton).not.toBeNull();

      act(() => {
        fireEvent.keyDown(input, { key: 'Enter' });
        if (artistButton) fireEvent.click(artistButton);
      });

      expect(mockClear).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockTrack).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(mockTrack.mock.calls)).not.toContain('Taylor');
    });

    it('routes a typed submit with no highlighted result as a free-text prompt, never results[0]', async () => {
      // JOV-6114 regression: "Michael Jackson" used to navigate with
      // spotify_url/artist_name of results[0] (a different artist entirely).
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Michael Jackson');
      await user.keyboard('{Enter}');

      expect(mockPush).toHaveBeenCalledTimes(1);
      const url = mockPush.mock.calls[0][0] as string;
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('spotify_url')).toBeNull();
      expect(params.get('artist_name')).toBeNull();
      expect(params.get('starter_prompt')).toBe(
        "hey, I'm Michael Jackson. show me my Spotify."
      );
    });

    it('claim button submits a free-text prompt when results are empty', async () => {
      mockHookReturn.results = [];
      mockHookReturn.state = 'empty';
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'xyznonexistent');

      const claimButton = screen.getByRole('button', {
        name: /Claim Artist/i,
      });
      expect(claimButton).not.toBeDisabled();
      await user.click(claimButton);

      expect(mockPush).toHaveBeenCalledTimes(1);
      const url = mockPush.mock.calls[0][0] as string;
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('spotify_url')).toBeNull();
      expect(params.get('starter_prompt')).toBe(
        "hey, I'm xyznonexistent. show me my Spotify."
      );
    });

    it('emits a URL that /start resolves as a spotify_artist handoff (joined contract)', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      await user.click(screen.getByText('Taylor Swift'));

      const url = mockPush.mock.calls[0][0] as string;
      expect(url.startsWith('/start?')).toBe(true);
      // The receiver owns the param contract: whatever the hero emits must
      // resolve through the real /start entry-handoff parser, unchanged.
      const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
      expect(resolveStartEntryHandoff(params)).toEqual({
        kind: 'spotify_artist',
        prompt: "hey, I'm Taylor Swift. show me my Spotify.",
        spotifyUrl: ARTISTS[0].url,
        artistName: 'Taylor Swift',
      });
    });

    it('emits a URL that /start resolves as a prompt handoff for free-text submit', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Michael Jackson');
      await user.keyboard('{Enter}');

      const url = mockPush.mock.calls[0][0] as string;
      const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
      expect(resolveStartEntryHandoff(params)).toEqual({
        kind: 'prompt',
        prompt: "hey, I'm Michael Jackson. show me my Spotify.",
      });
    });

    it('does not replay navigation on a repeated submit while still mounted', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      await user.click(screen.getByText('Taylor Swift'));
      expect(mockPush).toHaveBeenCalledTimes(1);

      // The push resolves asynchronously; before unmount, a repeated Enter,
      // or reopening the dropdown and re-clicking the same artist, must not
      // emit a second /start navigation.
      await user.keyboard('{Enter}');
      fireEvent.focus(input);
      await user.click(screen.getByText('Taylor Swift'));
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it('re-arms the funnel when the visitor types after an incomplete navigation', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      await user.click(screen.getByText('Taylor Swift'));
      expect(mockPush).toHaveBeenCalledTimes(1);

      // If the component stayed mounted (prefetch cache, interrupted nav), a
      // fresh keystroke is new intent and must release the navigation latch.
      await user.type(input, ' Phoebe');
      await user.keyboard('{Enter}');
      expect(mockPush).toHaveBeenCalledTimes(2);
      const url = mockPush.mock.calls[1][0] as string;
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('starter_prompt')).toBe(
        "hey, I'm Taylor Phoebe. show me my Spotify."
      );
    });

    it('verified badge shown for verified artists', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      // Taylor Swift is verified — her row should contain a verified-badge testid
      const taylorButton = screen.getByText('Taylor Swift').closest('button')!;
      expect(
        within(taylorButton).getByTestId('verified-badge')
      ).toBeInTheDocument();
      // Phoebe Bridgers is not verified — no verified badge in her row
      const phoebeButton = screen
        .getByText('Phoebe Bridgers')
        .closest('button')!;
      expect(
        within(phoebeButton).queryByTestId('verified-badge')
      ).not.toBeInTheDocument();
    });
  });

  describe('URL detection', () => {
    it('shows Claim Artist button on Spotify URL input and navigates on click', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(
        getInput(),
        'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02'
      );
      // Should NOT auto-navigate — user must click "Claim Artist"
      expect(mockPush).not.toHaveBeenCalled();
      const claimButton = screen.getByRole('button', {
        name: /Claim Artist/i,
      });
      await user.click(claimButton);
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/start?spotify_url=')
      );
    });

    it('shows placeholder text in input', () => {
      renderComponent();
      expect(getInput()).toHaveAttribute(
        'placeholder',
        'Search your artist name or paste a Spotify link'
      );
    });
  });

  describe('paste URL option', () => {
    beforeEach(() => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
    });

    it('always appears as last option in dropdown', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      const listbox = screen.getByRole('listbox');
      const options = within(listbox).getAllByRole('option');
      const lastOption = options[options.length - 1];
      expect(lastOption).toHaveTextContent('Paste a Spotify URL instead');
    });

    it('click clears input and focuses it', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      // Text appears in both a hidden <option> and visible <button>; click the button
      const pasteButtons = screen.getAllByText('Paste a Spotify URL instead');
      const visibleButton = pasteButtons.find(
        el => el.closest('button') !== null
      )!;
      await user.click(visibleButton);
      expect(mockClear).toHaveBeenCalled();
      expect(input).toHaveValue('');
    });

    it('keyboard Enter on paste option works', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      // Navigate down past all 3 artists to the paste URL option (index 3)
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        'hero-spotify-results-result-3'
      );
      await user.keyboard('{Enter}');
      expect(mockClear).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    beforeEach(() => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
    });

    it('dropdown has listbox role', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('options have option role', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      const options = screen.getAllByRole('option');
      // 1 disabled placeholder + 3 artists + 1 paste URL = 5
      expect(options).toHaveLength(5);
    });

    it('active selection updates with keyboard navigation', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      // Initially no active descendant
      expect(input).not.toHaveAttribute('aria-activedescendant');
      // ArrowDown selects first artist
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        'hero-spotify-results-result-0'
      );
      // ArrowDown again selects second artist
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        'hero-spotify-results-result-1'
      );
    });

    it('aria-controls references listbox id', async () => {
      renderComponent();
      const input = getInput();
      expect(input).toHaveAttribute('aria-controls', 'hero-spotify-results');
    });

    it('aria-expanded reflects dropdown state', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      await user.type(input, 'Taylor');
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });

  // JOV-6553: claimed ≠ membership. The badge must never claim the artist
  // is "On Jovie" — expected copy authored from the approved contract.
  describe('truthful artist status (JOV-6553)', () => {
    it('claimed artists show a truthful listing badge, never "On Jovie"', async () => {
      mockHookReturn.results = ARTISTS.map(artist => ({
        ...artist,
        isClaimed: artist.id === 'artist-1',
      }));
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');

      const badge = screen.getByTestId('listing-badge');
      expect(badge).toHaveTextContent('Jovie listing');
      expect(badge.textContent).not.toContain('On Jovie');
    });

    it('unclaimed artists show no listing badge', async () => {
      mockHookReturn.results = ARTISTS.map(artist => ({
        ...artist,
        isClaimed: artist.id === 'artist-1',
      }));
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Phoebe');

      const row = screen.getByText('Phoebe Bridgers').closest('button');
      expect(row).not.toBeNull();
      expect(
        row?.querySelector('[data-testid="listing-badge"]')
      ).not.toBeInTheDocument();
    });
  });
});
