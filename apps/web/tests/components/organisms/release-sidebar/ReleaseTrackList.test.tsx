import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseTrackList } from '@/components/organisms/release-sidebar/ReleaseTrackList';
import { createMockRelease } from '@/tests/test-utils/factories';

const { mockToggleTrack, mockQueryResult, mockPlaybackState } = vi.hoisted(
  () => ({
    mockToggleTrack: vi.fn().mockResolvedValue(undefined),
    mockQueryResult: {
      data: null,
      isLoading: false,
      isFetching: false,
      isError: false,
    } as {
      data: unknown;
      isLoading: boolean;
      isFetching: boolean;
      isError: boolean;
    },
    mockPlaybackState: {
      activeTrackId: null as string | null,
      isPlaying: false,
      playbackStatus: 'idle' as
        | 'idle'
        | 'loading'
        | 'playing'
        | 'paused'
        | 'error',
      currentTime: 0,
      duration: 0,
      trackTitle: null as string | null,
    },
  })
);

vi.mock('@/components/molecules/drawer', () => ({
  DrawerEmptyState: ({ message }: { readonly message: string }) => (
    <div>{message}</div>
  ),
}));

vi.mock('@/lib/queries', () => ({
  useReleaseTracksQuery: () => mockQueryResult,
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mockPlaybackState,
    toggleTrack: mockToggleTrack,
  }),
}));

describe('ReleaseTrackList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResult.data = null;
    mockQueryResult.isLoading = false;
    mockQueryResult.isFetching = false;
    mockQueryResult.isError = false;
    mockPlaybackState.activeTrackId = null;
    mockPlaybackState.isPlaying = false;
    mockPlaybackState.playbackStatus = 'idle';
    mockPlaybackState.currentTime = 0;
    mockPlaybackState.duration = 0;
    mockPlaybackState.trackTitle = null;
  });

  it('renders a flat track list without the old playback summary or card chrome', () => {
    const release = createMockRelease();

    render(
      <ReleaseTrackList
        release={release}
        tracksOverride={[
          {
            id: 'track_1',
            releaseId: release.id,
            releaseSlug: release.slug,
            title: 'Static Skies',
            slug: 'static-skies',
            smartLinkPath: `${release.smartLinkPath}/static-skies`,
            trackNumber: 1,
            discNumber: 1,
            durationMs: 185000,
            isrc: 'USRC17607839',
            isExplicit: false,
            previewUrl: 'https://example.com/preview.mp3',
            audioUrl: null,
            audioFormat: null,
            previewSource: 'spotify',
            previewVerification: 'verified',
            providerConfidenceSummary: {
              canonical: 1,
              searchFallback: 1,
              unknown: 0,
              unresolvedProviders: [],
            },
            providers: [],
          },
        ]}
      />
    );

    const tracklist = screen.getByTestId('tracklist');
    const row = screen.getByTestId('release-track-row-track_1');
    const control = screen.getByTestId('release-track-control-track_1');

    expect(tracklist).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-preview-summary')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('release-provider-summary')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('release-track-status-track_1')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { expanded: false })
    ).not.toBeInTheDocument();
    expect(row).not.toHaveAttribute('data-variant', 'card');
    expect(control).toHaveTextContent('1');
    expect(screen.getByText('Static Skies')).toBeInTheDocument();
    expect(screen.getByText('3:05')).toBeInTheDocument();
  });

  it('swaps the number slot for a pause control on the active track', () => {
    const release = createMockRelease();
    mockPlaybackState.activeTrackId = 'track_1';
    mockPlaybackState.isPlaying = true;
    mockPlaybackState.playbackStatus = 'playing';
    mockPlaybackState.trackTitle = 'Static Skies';

    render(
      <ReleaseTrackList
        release={release}
        tracksOverride={[
          {
            id: 'track_1',
            releaseId: release.id,
            releaseSlug: release.slug,
            title: 'Static Skies',
            slug: 'static-skies',
            smartLinkPath: `${release.smartLinkPath}/static-skies`,
            trackNumber: 1,
            discNumber: 1,
            durationMs: 185000,
            isrc: 'USRC17607839',
            isExplicit: false,
            previewUrl: 'https://example.com/preview.mp3',
            audioUrl: null,
            audioFormat: null,
            previewSource: 'spotify',
            previewVerification: 'verified',
            providerConfidenceSummary: {
              canonical: 1,
              searchFallback: 0,
              unknown: 0,
              unresolvedProviders: [],
            },
            providers: [],
          },
        ]}
      />
    );

    const control = screen.getByTestId('release-track-control-track_1');

    expect(
      screen.getByRole('button', { name: 'Pause Static Skies' })
    ).toBeInTheDocument();
    expect(within(control).queryByText('1')).not.toBeInTheDocument();
  });

  it('starts playback from the left slot with the correct track payload', async () => {
    const user = userEvent.setup();
    const release = createMockRelease({
      title: 'Midnight Sun',
      artistNames: ['Test Artist'],
      artworkUrl: 'https://cdn.example.com/cover.png',
    });

    render(
      <ReleaseTrackList
        release={release}
        tracksOverride={[
          {
            id: 'track_1',
            releaseId: release.id,
            releaseSlug: release.slug,
            title: 'Static Skies',
            slug: 'static-skies',
            smartLinkPath: `${release.smartLinkPath}/static-skies`,
            trackNumber: 1,
            discNumber: 1,
            durationMs: 185000,
            isrc: 'USRC17607839',
            isExplicit: false,
            previewUrl: 'https://example.com/preview.mp3',
            audioUrl: null,
            audioFormat: null,
            previewSource: 'spotify',
            previewVerification: 'verified',
            providerConfidenceSummary: {
              canonical: 1,
              searchFallback: 0,
              unknown: 0,
              unresolvedProviders: [],
            },
            providers: [],
          },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Play Static Skies' }));

    expect(mockToggleTrack).toHaveBeenCalledWith({
      id: 'track_1',
      title: 'Static Skies',
      audioUrl: 'https://example.com/preview.mp3',
      isrc: 'USRC17607839',
      releaseTitle: 'Midnight Sun',
      artistName: release.artistNames?.[0],
      artworkUrl: release.artworkUrl,
    });
  });

  it('renders simplified loading, error, and empty states', () => {
    const release = createMockRelease({ totalTracks: 2 });

    mockQueryResult.isLoading = true;
    const { rerender } = render(<ReleaseTrackList release={release} />);

    expect(screen.getAllByTestId('release-track-skeleton')).toHaveLength(1);

    mockQueryResult.isLoading = false;
    mockQueryResult.isError = true;
    rerender(<ReleaseTrackList release={release} />);
    expect(screen.getByText('Failed to load tracks.')).toBeInTheDocument();

    mockQueryResult.isError = false;
    mockQueryResult.data = [];
    rerender(<ReleaseTrackList release={release} />);
    expect(screen.getByText('No track data available.')).toBeInTheDocument();
  });
});
