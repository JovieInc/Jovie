'use client';

import type { AudioPlaybackStatus } from '@jovie/audio-contracts';
import { ChevronRight, Pause, Play } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from '@/components/feedback';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import type { ReleaseSidebarTrack } from '@/lib/discography/types';
import { useReleaseTracksQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { TrackSidebarData } from './TrackSidebar';
import type { Release } from './types';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

interface ReleaseTrackListProps {
  readonly release: Release;
  readonly tracksOverride?: ReleaseSidebarTrack[];
  /** When provided, each track row becomes clickable and opens the track drawer. */
  readonly onTrackClick?: (track: TrackSidebarData) => void;
}

function buildTrackSidebarData(
  track: ReleaseSidebarTrack,
  release: Release
): TrackSidebarData {
  return {
    id: track.id,
    title: track.title,
    slug: track.slug,
    smartLinkPath: track.smartLinkPath,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    durationMs: track.durationMs,
    isrc: track.isrc,
    isExplicit: track.isExplicit,
    previewUrl: track.previewUrl,
    audioUrl: track.audioUrl,
    audioFormat: track.audioFormat,
    lyrics: null,
    previewSource: track.previewSource,
    previewVerification: track.previewVerification,
    providerConfidenceSummary: track.providerConfidenceSummary,
    providers: track.providers,
    releaseTitle: release.title,
    releaseArtworkUrl: release.artworkUrl,
    releaseId: release.id,
  };
}

interface TrackControlSource {
  readonly id: string;
  readonly title: string;
  readonly audioUrl?: string;
  readonly isrc?: string | null;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
  readonly hasLyrics?: boolean;
}

function getCanonicalTrackLabel(track: ReleaseSidebarTrack): string {
  return track.discNumber > 1
    ? `${track.discNumber}-${track.trackNumber}`
    : String(track.trackNumber);
}

function getDisplayTrackLabel(params: {
  track: ReleaseSidebarTrack;
  index: number;
  isSingleDiscPartialSubset: boolean;
}): string {
  const { track, index, isSingleDiscPartialSubset } = params;
  if (isSingleDiscPartialSubset) {
    return String(index + 1);
  }

  return getCanonicalTrackLabel(track);
}

function buildReleasePlaybackQueue(
  tracks: readonly ReleaseSidebarTrack[],
  release: Release
): TrackControlSource[] {
  return tracks.flatMap(track => {
    const audioUrl = track.audioUrl ?? track.previewUrl ?? undefined;
    if (!audioUrl) return [];

    return [
      {
        id: track.id,
        title: track.title,
        audioUrl,
        isrc: track.isrc,
        releaseTitle: release.title,
        artistName: release.artistNames?.[0],
        artworkUrl: release.artworkUrl,
        hasLyrics: Boolean(track.lyrics?.trim()),
      },
    ];
  });
}

export function ReleaseTrackList({
  release,
  tracksOverride,
  onTrackClick,
}: ReleaseTrackListProps) {
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const {
    data: fetchedTracks,
    isLoading,
    isFetching,
    isError: hasError,
  } = useReleaseTracksQuery(
    release.id,
    !tracksOverride && release.totalTracks > 0
  );
  const tracks = tracksOverride ?? fetchedTracks;
  const playbackQueue = useMemo(
    () => (tracks ? buildReleasePlaybackQueue(tracks, release) : []),
    [release, tracks]
  );

  let liveAnnouncement = '';
  if (playbackState.playbackStatus === 'error') {
    liveAnnouncement = 'Preview unavailable.';
  } else if (
    playbackState.playbackStatus === 'playing' &&
    playbackState.trackTitle
  ) {
    liveAnnouncement = `Now playing ${playbackState.trackTitle}.`;
  } else if (playbackState.playbackStatus === 'paused') {
    liveAnnouncement = 'Playback paused.';
  }

  if (release.totalTracks === 0) return null;

  if (isLoading || (isFetching && !tracks)) {
    return (
      <div className='space-y-1' data-testid='tracklist'>
        {Array.from(
          { length: Math.min(release.totalTracks, 6) },
          (_, index) => `sk${index}`
        ).map(id => (
          <div
            key={id}
            className='flex items-center gap-3 rounded-xl px-1 py-2.5'
            data-testid='release-track-skeleton'
          >
            <div className='h-8 w-8 rounded-full skeleton' />
            <div className='min-w-0 flex-1 space-y-1.5'>
              <div className='h-4 w-1/2 rounded skeleton' />
              <div className='h-3 w-16 rounded skeleton' />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (hasError) {
    return (
      <DrawerEmptyState
        className='min-h-12 px-0'
        message='Failed to load tracks.'
        tone='error'
      />
    );
  }

  if (!tracks || tracks.length === 0) {
    return (
      <DrawerEmptyState
        className='min-h-12 px-0'
        message='No track data available.'
      />
    );
  }

  const inferredDiscCount = Math.max(
    1,
    ...tracks.map(track => track.discNumber)
  );
  const isSingleDiscPartialSubset =
    tracks.length < release.totalTracks &&
    (release.totalDiscs ?? inferredDiscCount) === 1;

  return (
    <div className='space-y-1' data-testid='tracklist'>
      <p className='sr-only' aria-live='polite'>
        {liveAnnouncement}
      </p>
      {tracks.map((track, index) => (
        <TrackListRow
          key={track.id}
          track={track}
          trackLabel={getDisplayTrackLabel({
            track,
            index,
            isSingleDiscPartialSubset,
          })}
          release={release}
          playbackState={playbackState}
          playbackQueue={playbackQueue}
          onToggleTrack={toggleTrack}
          isLastRow={index === tracks.length - 1}
          onSelect={
            onTrackClick
              ? () => onTrackClick(buildTrackSidebarData(track, release))
              : undefined
          }
        />
      ))}
    </div>
  );
}

function TrackListRow({
  track,
  trackLabel,
  release,
  playbackState,
  playbackQueue,
  onToggleTrack,
  isLastRow,
  onSelect,
}: {
  readonly track: ReleaseSidebarTrack;
  readonly trackLabel: string;
  readonly release: Release;
  readonly playbackState: {
    activeTrackId: string | null;
    isPlaying: boolean;
    playbackStatus?: AudioPlaybackStatus;
  };
  readonly playbackQueue: readonly TrackControlSource[];
  readonly onToggleTrack: (
    track: TrackControlSource,
    options?: { queue?: readonly TrackControlSource[] }
  ) => Promise<void>;
  readonly isLastRow: boolean;
  readonly onSelect?: () => void;
}) {
  const playableUrl = track.audioUrl ?? track.previewUrl ?? undefined;
  const isActiveTrack = playbackState.activeTrackId === track.id;
  const isTrackPlaying = isActiveTrack && playbackState.isPlaying;
  const trackDuration =
    track.durationMs == null ? null : formatDuration(track.durationMs);

  const handleTogglePlayback = useCallback(() => {
    if (isActiveTrack) {
      onToggleTrack({
        id: track.id,
        title: track.title,
      }).catch(() => {
        toast.error('Unable to control playback right now');
      });
      return;
    }

    if (!playableUrl) {
      return;
    }

    onToggleTrack(
      {
        id: track.id,
        title: track.title,
        audioUrl: playableUrl,
        isrc: track.isrc,
        releaseTitle: release.title,
        artistName: release.artistNames?.[0],
        artworkUrl: release.artworkUrl,
        hasLyrics: Boolean(track.lyrics?.trim()),
      },
      { queue: playbackQueue }
    ).catch(() => {
      toast.error('Unable to play this track right now');
    });
  }, [
    isActiveTrack,
    onToggleTrack,
    playbackQueue,
    playableUrl,
    release.artistNames,
    release.artworkUrl,
    release.title,
    track.id,
    track.isrc,
    track.lyrics,
    track.title,
  ]);

  function getControlLabel(): string {
    if (!playableUrl && !isActiveTrack) {
      return `No preview available for ${track.title}`;
    }

    return isTrackPlaying ? `Pause ${track.title}` : `Play ${track.title}`;
  }

  const controlLabel = getControlLabel();

  let trackButtonContent: React.JSX.Element;
  if (isActiveTrack && isTrackPlaying) {
    trackButtonContent = <Pause className='h-3.5 w-3.5' aria-hidden='true' />;
  } else if (isActiveTrack) {
    trackButtonContent = (
      <Play className='h-3.5 w-3.5 translate-x-px' aria-hidden='true' />
    );
  } else {
    trackButtonContent = <span aria-hidden='true'>{trackLabel}</span>;
  }

  const titleNode = (
    <p className='truncate text-xs font-caption leading-tight text-primary-token'>
      {track.title}
    </p>
  );

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5',
        !isLastRow &&
          'border-b border-[color-mix(in_oklab,var(--app-shell-frame-seam)_58%,transparent)]'
      )}
      data-testid={`release-track-row-${track.id}`}
    >
      <button
        type='button'
        onClick={handleTogglePlayback}
        disabled={!playableUrl && !isActiveTrack}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-caption tabular-nums transition-[background-color,color,border-color] duration-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          isActiveTrack
            ? 'border border-(--app-shell-frame-seam) bg-surface-0 text-primary-token hover:bg-surface-1'
            : 'border border-transparent bg-transparent text-tertiary-token hover:bg-surface-0 hover:text-primary-token',
          !playableUrl &&
            !isActiveTrack &&
            'cursor-not-allowed text-quaternary-token hover:bg-transparent hover:text-quaternary-token'
        )}
        aria-label={controlLabel}
        data-testid={`release-track-control-${track.id}`}
      >
        {trackButtonContent}
      </button>

      {onSelect ? (
        <button
          type='button'
          onClick={onSelect}
          className='group/track-open flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left transition-[color,background-color] duration-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          aria-label={`Open track details for ${track.title}`}
          data-testid={`release-track-open-${track.id}`}
        >
          <span className='min-w-0 flex-1 truncate'>{titleNode}</span>
          <ChevronRight
            className='h-3.5 w-3.5 shrink-0 text-quaternary-token opacity-0 transition-opacity duration-subtle group-hover/track-open:opacity-100'
            aria-hidden='true'
          />
        </button>
      ) : (
        <div className='min-w-0 flex-1'>{titleNode}</div>
      )}

      {trackDuration ? (
        <span className='shrink-0 text-2xs tabular-nums text-tertiary-token'>
          {trackDuration}
        </span>
      ) : null}
    </div>
  );
}
