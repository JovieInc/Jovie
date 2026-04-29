import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseTrackList } from '@/components/organisms/release-sidebar/ReleaseTrackList';
import type { ReleaseSidebarTrack } from '@/lib/discography/types';
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

function createTrack(
  release: ReturnType<typeof createMockRelease>,
  overrides: Partial<ReleaseSidebarTrack> = {}
): ReleaseSidebarTrack {
  return {
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
    ...overrides,
  };
}

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
    const track = createTrack(release, {
      providerConfidenceSummary: {
        canonical: 1,
        searchFallback: 1,
        unknown: 0,
        unresolvedProviders: [],
      },
    });

    render(<ReleaseTrackList release={release} tracksOverride={[track]} />);

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
        tracksOverride={[createTrack(release)]}
      />
    );

    const control = screen.getByTestId('release-track-control-track_1');

    expect(
      screen.getByRole('button', { name: 'Pause Static Skies' })
    ).toBeInTheDocument();
    expect(within(control).queryByText('1')).not.toBeInTheDocument();
  });

  it('announces paused playback without repeating a now-playing message', () => {
    const release = createMockRelease();
    mockPlaybackState.activeTrackId = 'track_1';
    mockPlaybackState.isPlaying = false;
    mockPlaybackState.playbackStatus = 'paused';
    mockPlaybackState.trackTitle = 'Static Skies';

    render(
      <ReleaseTrackList
        release={release}
        tracksOverride={[createTrack(release)]}
      />
    );

    expect(screen.getByText('Playback paused.')).toBeInTheDocument();
    expect(
      screen.queryByText('Now playing Static Skies.')
    ).not.toBeInTheDocument();
  });

  it('starts playback from the left slot with the correct track payload', async () => {
    const user = userEvent.setup();
    const release = {
      ...createMockRelease({
        title: 'Midnight Sun',
      }),
      artistNames: ['Test Artist'],
      artworkUrl: 'https://cdn.example.com/cover.png',
    };

    render(
      <ReleaseTrackList
        release={release}
        tracksOverride={[createTrack(release)]}
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
      hasLyrics: false,
    });
  });

  it('normalizes visible numbering for a sparse single-disc partial subset', () => {
    const release = { ...createMockRelease(), totalTracks: 18 };
    const sparseTracks = [
      createTrack(release, {
        id: 'track_1',
        title: 'Free (with Ellie Goulding)',
        slug: 'free-with-ellie-goulding',
        smartLinkPath: `${release.smartLinkPath}/free-with-ellie-goulding`,
        trackNumber: 1,
      }),
      createTrack(release, {
        id: 'track_2',
        title: 'How Deep Is Your Love',
        slug: 'how-deep-is-your-love',
        smartLinkPath: `${release.smartLinkPath}/how-deep-is-your-love`,
        trackNumber: 2,
      }),
      createTrack(release, {
        id: 'track_3',
        title: 'This Is What You Came For (with Rihanna)',
        slug: 'this-is-what-you-came-for',
        smartLinkPath: `${release.smartLinkPath}/this-is-what-you-came-for`,
        trackNumber: 3,
      }),
      createTrack(release, {
        id: 'track_9',
        title: 'Miracle (with Ellie Goulding)',
        slug: 'miracle-with-ellie-goulding',
        smartLinkPath: `${release.smartLinkPath}/miracle-with-ellie-goulding`,
        trackNumber: 9,
      }),
      createTrack(release, {
        id: 'track_11',
        title: 'Desire (with Sam Smith)',
        slug: 'desire-with-sam-smith',
        smartLinkPath: `${release.smartLinkPath}/desire-with-sam-smith`,
        trackNumber: 11,
      }),
      createTrack(release, {
        id: 'track_13',
        title: "Lovers In A Past Life (with Rag'n'Bone Man)",
        slug: 'lovers-in-a-past-life-with-ragnbone-man',
        smartLinkPath: `${release.smartLinkPath}/lovers-in-a-past-life-with-ragnbone-man`,
        trackNumber: 13,
      }),
    ];

    render(
      <ReleaseTrackList release={release} tracksOverride={sparseTracks} />
    );

    const controlLabels = sparseTracks.map(track =>
      screen
        .getByTestId(`release-track-control-${track.id}`)
        .textContent?.trim()
    );

    expect(controlLabels).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(
      screen.getByRole('button', { name: 'Play Miracle (with Ellie Goulding)' })
    ).toHaveTextContent('4');
  });

  it('keeps canonical numbering when the rendered list is complete', () => {
    const release = { ...createMockRelease(), totalTracks: 3 };
    const tracks = [
      createTrack(release, { id: 'track_1', trackNumber: 1 }),
      createTrack(release, { id: 'track_3', trackNumber: 3 }),
      createTrack(release, { id: 'track_5', trackNumber: 5 }),
    ];

    render(<ReleaseTrackList release={release} tracksOverride={tracks} />);

    expect(
      screen.getByTestId('release-track-control-track_1')
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId('release-track-control-track_3')
    ).toHaveTextContent('3');
    expect(
      screen.getByTestId('release-track-control-track_5')
    ).toHaveTextContent('5');
  });

  it('keeps disc-track labels for multi-disc subsets', () => {
    const release = { ...createMockRelease(), totalTracks: 10, totalDiscs: 2 };
    const tracks = [
      createTrack(release, { id: 'track_1', trackNumber: 1, discNumber: 1 }),
      createTrack(release, {
        id: 'track_2_1',
        trackNumber: 1,
        discNumber: 2,
        title: 'Disc Two Intro',
        slug: 'disc-two-intro',
        smartLinkPath: `${release.smartLinkPath}/disc-two-intro`,
      }),
      createTrack(release, {
        id: 'track_2_3',
        trackNumber: 3,
        discNumber: 2,
        title: 'Disc Two Finale',
        slug: 'disc-two-finale',
        smartLinkPath: `${release.smartLinkPath}/disc-two-finale`,
      }),
    ];

    render(<ReleaseTrackList release={release} tracksOverride={tracks} />);

    expect(
      screen.getByTestId('release-track-control-track_1')
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId('release-track-control-track_2_1')
    ).toHaveTextContent('2-1');
    expect(
      screen.getByTestId('release-track-control-track_2_3')
    ).toHaveTextContent('2-3');
  });

  it('keeps canonical numbering when a multi-disc subset only includes disc one tracks', () => {
    const release = { ...createMockRelease(), totalTracks: 12, totalDiscs: 2 };
    const tracks = [
      createTrack(release, { id: 'track_1', trackNumber: 1, discNumber: 1 }),
      createTrack(release, { id: 'track_5', trackNumber: 5, discNumber: 1 }),
      createTrack(release, {
        id: 'track_10',
        trackNumber: 10,
        discNumber: 1,
      }),
    ];

    render(<ReleaseTrackList release={release} tracksOverride={tracks} />);

    expect(
      screen.getByTestId('release-track-control-track_1')
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId('release-track-control-track_5')
    ).toHaveTextContent('5');
    expect(
      screen.getByTestId('release-track-control-track_10')
    ).toHaveTextContent('10');
  });

  it('renders simplified loading, error, and empty states', () => {
    const release = { ...createMockRelease(), totalTracks: 2 };

    mockQueryResult.isLoading = true;
    const { rerender } = render(<ReleaseTrackList release={release} />);

    expect(screen.getAllByTestId('release-track-skeleton')).toHaveLength(
      Math.min(release.totalTracks, 6)
    );

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
