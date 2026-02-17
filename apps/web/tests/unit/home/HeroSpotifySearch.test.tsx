import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroSpotifySearch } from '@/components/home/HeroSpotifySearch';
import type {
  ArtistSearchState,
  SpotifyArtistResult,
} from '@/lib/queries/useArtistSearchQuery';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// --- Mocks ---

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSearch = vi.fn();
const mockClear = vi.fn();
const mockHookReturn = {
  results: [] as SpotifyArtistResult[],
  state: 'idle' as ArtistSearchState,
  search: mockSearch,
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

    it('renders combobox role on input', () => {
      renderComponent();
      expect(getInput()).toHaveAttribute('role', 'combobox');
    });

    it('renders search icon when idle', () => {
      renderComponent();
      // Lucide Search icon renders as an SVG inside the input container
      const container = screen.getByRole('combobox').closest('div');
      expect(container?.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('search interaction', () => {
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

    it('shows error state message', async () => {
      mockHookReturn.state = 'error';
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'fail');
      expect(screen.getByText('Search failed. Try again.')).toBeInTheDocument();
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
      expect(input).toHaveAttribute('aria-activedescendant', 'hero-result-0');
    });

    it('ArrowUp wraps to last item', async () => {
      renderComponent();
      const user = userEvent.setup();
      const input = getInput();
      await user.type(input, 'Taylor');
      // activeIndex starts at -1. ArrowUp should wrap to last (pasteUrlIndex = 3)
      await user.keyboard('{ArrowUp}');
      expect(input).toHaveAttribute('aria-activedescendant', 'hero-result-3');
    });

    it('Enter selects active artist', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/signup?')
      );
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
      expect(input).toHaveAttribute('aria-activedescendant', 'hero-result-0');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute('aria-activedescendant', 'hero-result-1');
    });
  });

  describe('artist selection', () => {
    beforeEach(() => {
      mockHookReturn.results = ARTISTS;
      mockHookReturn.state = 'success';
    });

    it('click navigates to signup with spotify_url and artist_name params', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      await user.click(screen.getByText('Taylor Swift'));
      expect(mockPush).toHaveBeenCalledTimes(1);
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).toContain('/signup?');
      expect(url).toContain('spotify_url=');
      expect(url).toContain('artist_name=Taylor+Swift');
    });

    it('verified badge shown for verified artists', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(getInput(), 'Taylor');
      // Taylor Swift is verified — her visible button row should contain a BadgeCheck SVG
      const taylorButton = screen.getByText('Taylor Swift').closest('button')!;
      expect(taylorButton.querySelector('svg')).toBeInTheDocument();
      // Phoebe Bridgers is not verified — no SVG in her row
      const phoebeButton = screen
        .getByText('Phoebe Bridgers')
        .closest('button')!;
      expect(phoebeButton.querySelector('svg')).not.toBeInTheDocument();
    });
  });

  describe('URL detection', () => {
    it('navigates immediately on Spotify URL input', async () => {
      renderComponent();
      const user = userEvent.setup();
      await user.type(
        getInput(),
        'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02'
      );
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/signup?spotify_url=')
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
      expect(input).toHaveAttribute('aria-activedescendant', 'hero-result-3');
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
      expect(input).toHaveAttribute('aria-activedescendant', 'hero-result-0');
      // ArrowDown again selects second artist
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute('aria-activedescendant', 'hero-result-1');
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
});
