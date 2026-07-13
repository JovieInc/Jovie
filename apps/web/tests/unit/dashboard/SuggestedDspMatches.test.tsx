import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { primaryNavigation } from '@/components/features/dashboard/dashboard-nav/config';
import { SuggestedDspMatches } from '@/features/dashboard/organisms/profile-contact-sidebar/SuggestedDspMatches';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseDspMatchesQuery, mockUseDspMatchActions } = vi.hoisted(() => ({
  mockUseDspMatchesQuery: vi.fn(),
  mockUseDspMatchActions: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<object>('@jovie/ui');
  return {
    ...actual,
    Button: ({ children, ...props }: ComponentProps<'button'>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
    Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
    PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    PopoverContent: ({ children }: { children: ReactNode }) => (
      <div data-testid='popover-content'>{children}</div>
    ),
  };
});

vi.mock('next/navigation', () => ({}));

vi.mock('@/lib/queries', () => ({
  useDspMatchesQuery: mockUseDspMatchesQuery,
}));

vi.mock('@/features/dashboard/organisms/dsp-matches/hooks', () => ({
  useDspMatchActions: mockUseDspMatchActions,
}));

vi.mock('@/features/dashboard/atoms/DspProviderIcon', () => ({
  DspProviderIcon: ({ provider }: { provider: string }) => (
    <span data-testid={`dsp-icon-${provider}`}>{provider}</span>
  ),
  PROVIDER_LABELS: {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
    deezer: 'Deezer',
    youtube_music: 'YouTube Music',
    tidal: 'Tidal',
    soundcloud: 'SoundCloud',
    amazon_music: 'Amazon Music',
    musicbrainz: 'MusicBrainz',
    genius: 'Genius',
    discogs: 'Discogs',
    allmusic: 'AllMusic',
  },
}));

vi.mock('@/features/dashboard/atoms/ConfidenceBadge', () => ({
  ConfidenceBadge: ({ score }: { score: number }) => (
    <span data-testid='confidence-badge'>{Math.round(score * 100)}%</span>
  ),
}));

vi.mock('@/lib/utils/dsp-images', () => ({
  isExternalDspImage: () => false,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function createMatch(
  overrides: Partial<{
    id: string;
    providerId: string;
    externalArtistName: string;
    externalArtistUrl: string | null;
    externalArtistImageUrl: string | null;
    confidenceScore: number;
    matchingIsrcCount: number;
    status: string;
  }> = {}
) {
  return {
    id: 'match-1',
    providerId: 'deezer',
    externalArtistId: 'ext-1',
    externalArtistName: 'Test Artist',
    externalArtistUrl: 'https://deezer.com/artist/123',
    externalArtistImageUrl: 'https://cdn.deezer.com/photo.jpg',
    confidenceScore: 0.92,
    confidenceBreakdown: {
      isrcMatchScore: 0.9,
      upcMatchScore: 0,
      nameSimilarityScore: 0.95,
      followerRatioScore: 0,
      genreOverlapScore: 0,
    },
    matchingIsrcCount: 14,
    matchingUpcCount: 0,
    totalTracksChecked: 20,
    status: 'suggested',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultMatchActions = {
  dialogMatch: null,
  isDialogOpen: false,
  openConfirmDialog: vi.fn(),
  closeDialog: vi.fn(),
  confirmMatch: vi.fn(),
  rejectMatch: vi.fn(),
  confirmDialogMatch: vi.fn(),
  isConfirming: false,
  isRejecting: false,
  confirmingMatchId: null,
  rejectingMatchId: null,
  isMatchConfirming: vi.fn().mockReturnValue(false),
  isMatchRejecting: vi.fn().mockReturnValue(false),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuggestedDspMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDspMatchActions.mockReturnValue(defaultMatchActions);
  });

  it('renders suggestion rows with provider icon and artist name', () => {
    mockUseDspMatchesQuery.mockReturnValue({
      data: [createMatch()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    expect(screen.getByText('Suggested')).toBeInTheDocument();
    // Name appears in both row and popover content
    expect(screen.getAllByText('Test Artist').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId('dsp-icon-deezer').length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders skeleton rows while loading', () => {
    mockUseDspMatchesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<SuggestedDspMatches profileId='profile-1' />);

    expect(screen.getByText('Suggested')).toBeInTheDocument();
    // Skeleton rows have the skeleton class (at least 2 per row: icon + text)
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });

  it('returns null when no suggestions exist', () => {
    mockUseDspMatchesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<SuggestedDspMatches profileId='profile-1' />);

    expect(container.innerHTML).toBe('');
  });

  it('renders inline error with retry button on error', async () => {
    const refetchMock = vi.fn();
    mockUseDspMatchesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch: refetchMock,
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    expect(screen.getByText(/Couldn't load suggestions/)).toBeInTheDocument();
    const retryBtn = screen.getByText('Retry');
    await userEvent.click(retryBtn);
    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it('calls confirmMatch when confirm button is clicked', async () => {
    const confirmMock = vi.fn();
    mockUseDspMatchesQuery.mockReturnValue({
      data: [createMatch({ id: 'match-abc' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDspMatchActions.mockReturnValue({
      ...defaultMatchActions,
      confirmMatch: confirmMock,
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    const confirmBtn = screen.getByLabelText(
      'Confirm Deezer match for Test Artist'
    );
    await userEvent.click(confirmBtn);
    expect(confirmMock).toHaveBeenCalledWith('match-abc');
  });

  it('calls rejectMatch when reject button is clicked', async () => {
    const rejectMock = vi.fn();
    mockUseDspMatchesQuery.mockReturnValue({
      data: [createMatch({ id: 'match-xyz' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseDspMatchActions.mockReturnValue({
      ...defaultMatchActions,
      rejectMatch: rejectMock,
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    const rejectBtn = screen.getByLabelText(
      'Reject Deezer match for Test Artist'
    );
    await userEvent.click(rejectBtn);
    expect(rejectMock).toHaveBeenCalledWith('match-xyz');
  });

  it('shows first 5 and "Show N more" button when more than 5 suggestions', () => {
    const matches = Array.from({ length: 8 }, (_, i) =>
      createMatch({
        id: `match-${i}`,
        providerId: 'deezer',
        externalArtistName: `Artist ${i}`,
        confidenceScore: 0.9 - i * 0.05,
      })
    );

    mockUseDspMatchesQuery.mockReturnValue({
      data: matches,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    // First 5 should be visible (may appear in both row + popover)
    expect(screen.getAllByText('Artist 0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Artist 4').length).toBeGreaterThanOrEqual(1);
    // 6th should not be visible
    expect(screen.queryByText('Artist 5')).not.toBeInTheDocument();
    // Show more button
    expect(screen.getByText('Show 3 more')).toBeInTheDocument();
  });

  it('reveals remaining suggestions when "Show more" is clicked', async () => {
    const matches = Array.from({ length: 7 }, (_, i) =>
      createMatch({
        id: `match-${i}`,
        providerId: 'deezer',
        externalArtistName: `Artist ${i}`,
        confidenceScore: 0.9 - i * 0.05,
      })
    );

    mockUseDspMatchesQuery.mockReturnValue({
      data: matches,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    expect(screen.queryByText('Artist 6')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Show 2 more'));

    expect(screen.getAllByText('Artist 6').length).toBeGreaterThanOrEqual(1);
    // "Show more" button should be gone
    expect(screen.queryByText(/Show \d+ more/)).not.toBeInTheDocument();
  });

  it('sorts suggestions by confidence score descending', () => {
    const matches = [
      createMatch({
        id: 'low',
        externalArtistName: 'Low Confidence',
        confidenceScore: 0.5,
      }),
      createMatch({
        id: 'high',
        externalArtistName: 'High Confidence',
        confidenceScore: 0.95,
      }),
      createMatch({
        id: 'mid',
        externalArtistName: 'Mid Confidence',
        confidenceScore: 0.75,
      }),
    ];

    mockUseDspMatchesQuery.mockReturnValue({
      data: matches,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('High Confidence');
    expect(items[1]).toHaveTextContent('Mid Confidence');
    expect(items[2]).toHaveTextContent('Low Confidence');
  });

  it('renders popover content with artist details', () => {
    mockUseDspMatchesQuery.mockReturnValue({
      data: [
        createMatch({
          externalArtistName: 'Popover Artist',
          confidenceScore: 0.88,
          matchingIsrcCount: 7,
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    // Popover content is always rendered in test (mock removes portal)
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('88%');
    expect(screen.getByText('7 tracks verified')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('renders explanation text', () => {
    mockUseDspMatchesQuery.mockReturnValue({
      data: [createMatch()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SuggestedDspMatches profileId='profile-1' />);

    expect(
      screen.getByText(/We found profiles that may be you/)
    ).toBeInTheDocument();
  });
});

describe('Navigation config', () => {
  it('does not include presence in primaryNavigation', () => {
    const presenceItem = primaryNavigation.find(item => item.id === 'presence');
    expect(presenceItem).toBeUndefined();
  });
});
