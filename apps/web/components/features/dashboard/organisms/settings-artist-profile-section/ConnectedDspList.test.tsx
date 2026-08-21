import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectedDspList } from './ConnectedDspList';

const { queryState } = vi.hoisted(() => ({
  queryState: {
    data: [] as Array<Record<string, unknown>>,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  connectAppleMusicArtist: vi.fn(),
  connectSpotifyArtist: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    dspEnrichment: {
      matches: (profileId: string) => ['dsp-matches', profileId],
    },
  },
  useDspMatchesQuery: () => queryState,
  useTriggerDiscoveryMutation: () => ({ mutate: vi.fn() }),
  useRejectDspMatchMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/features/dashboard/atoms/DspConnectionPill', () => ({
  DspConnectionPill: ({ provider }: { provider: string }) => (
    <button type='button'>Connect {provider}</button>
  ),
}));

vi.mock('@/components/organisms/artist-search-palette', () => ({
  ArtistSearchCommandPalette: () => <div data-testid='artist-search-palette' />,
}));

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const renderTree = () => (
    <QueryClientProvider client={queryClient}>
      <ConnectedDspList profileId='profile-1' spotifyId={null} />
    </QueryClientProvider>
  );
  const view = render(renderTree());
  return {
    ...view,
    rerenderList: () => view.rerender(renderTree()),
  };
}

describe('ConnectedDspList settings anatomy', () => {
  beforeEach(() => {
    queryState.data = [];
    queryState.isLoading = false;
    queryState.error = null;
    queryState.refetch.mockReset();
  });

  it('keeps one reserved panel height while loading resolves', () => {
    queryState.isLoading = true;
    const { rerenderList } = renderList();

    const loadingStatus = screen.getByRole('status', {
      name: 'Loading Platform Connections',
    });
    expect(loadingStatus.parentElement).toHaveClass('min-h-80');
    expect(document.querySelectorAll('[data-state="shimmer"]')).toHaveLength(2);

    queryState.isLoading = false;
    rerenderList();

    expect(
      screen.getByText('No streaming profiles connected').closest('.min-h-80')
    ).not.toBeNull();
  });

  it('renders the canonical error hierarchy', () => {
    queryState.error = new Error('Unavailable');
    renderList();

    expect(
      screen.getByText('Unable to load streaming profiles')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Failed to load platform connections. Please try again.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(queryState.refetch).toHaveBeenCalledOnce();
  });

  it('does not render an empty state when a secondary profile is connected', () => {
    queryState.data = [
      {
        id: 'match-1',
        providerId: 'tidal',
        status: 'confirmed',
        externalArtistName: 'Ada Artist',
      },
    ];
    renderList();

    expect(
      screen.queryByText('No streaming profiles connected')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Other platforms')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect tidal' })).toBeVisible();
  });

  it('keeps connection controls and the empty state in one settings panel', () => {
    renderList();

    expect(screen.getByText('Streaming profiles')).toBeInTheDocument();
    expect(
      screen.getByText('No streaming profiles connected')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect spotify' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Connect apple_music' })
    ).toBeVisible();
    expect(screen.getByTestId('artist-search-palette')).toBeInTheDocument();
  });
});
