import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseSidebarTrack } from '@/lib/discography/types';
import { ReleaseTrackList } from './ReleaseTrackList';
import type { Release } from './types';

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
      currentTime: 0,
      duration: 0,
    },
    toggleTrack: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    onError: vi.fn().mockReturnValue(() => {}),
  }),
}));

vi.mock('@/lib/queries', () => ({
  useReleaseTracksQuery: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

const release = {
  id: 'release-1',
  title: 'Neon Coast',
  artworkUrl: null,
  artistNames: ['Test Artist'],
  totalTracks: 1,
} as unknown as Release;

function buildTrack(
  overrides: Partial<ReleaseSidebarTrack> = {}
): ReleaseSidebarTrack {
  return {
    id: 'track-1',
    releaseId: 'release-1',
    releaseSlug: 'neon-coast',
    title: 'Midnight Echo',
    slug: 'midnight-echo',
    smartLinkPath: '/r/midnight-echo',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 181000,
    isrc: null,
    isExplicit: false,
    previewUrl: null,
    audioUrl: null,
    audioFormat: null,
    providers: [],
    ...overrides,
  };
}

describe('ReleaseTrackList', () => {
  it('hides the playback control when no preview or audio URL exists (JOV-INV-046)', () => {
    render(
      <ReleaseTrackList release={release} tracksOverride={[buildTrack()]} />
    );

    expect(
      screen.getByTestId('release-track-number-track-1')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('release-track-control-track-1')).toBeNull();
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull();
  });

  it('renders the playback control when a preview URL exists', () => {
    render(
      <ReleaseTrackList
        release={release}
        tracksOverride={[
          buildTrack({ previewUrl: 'https://cdn.example.com/preview.mp3' }),
        ]}
      />
    );

    const control = screen.getByTestId('release-track-control-track-1');
    expect(control).toBeInTheDocument();
    expect(control).toHaveAttribute('aria-label', 'Play Midnight Echo');
  });
});
