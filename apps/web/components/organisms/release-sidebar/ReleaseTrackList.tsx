'use client';

import { Pause, Play } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import type { ReleaseSidebarTrack } from '@/lib/discography/types';
import { useReleaseTracksQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { Release } from './types';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

interface ReleaseTrackListProps {
  readonly release: Release;
  readonly tracksOverride?: ReleaseSidebarTrack[];
}

interface TrackControlSource {
  readonly id: string;
  readonly title: string;
  readonly audioUrl?: string;
  readonly isrc?: string | null;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
}

function getCanonicalTrackLabel(track: ReleaseSidebarTrack): string {
  return track.discNumber > 1
    ? `${track.discNumber}-${track.trackNumber}`
    : String(track.trackNumber);
}

function getDisplayTrackLabel(params: {
  track: ReleaseSidebarTrack;
  index: number;
  tracks: readonly ReleaseSidebarTrack[];
  totalTracks: number;
}): string {
  const { track, index, tracks, totalTracks } = params;
  const isPartialSubset = tracks.length < totalTracks;
  const isSingleDisc = tracks.every(item => item.discNumber === 1);

  if (!isSingleDisc) {
    return getCanonicalTrackLabel(track);
  }

  if (isPartialSubset) {
    return String(index + 1);
  }

  return getCanonicalTrackLabel(track);
}

export function ReleaseTrackList({
  release,
  tracksOverride,
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
            className='flex items-center gap-3 rounded-[12px] px-1 py-2.5'
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
        className='min-h-[48px] px-0'
        message='Failed to load tracks.'
        tone='error'
      />
    );
  }

  if (!tracks || tracks.length === 0) {
    return (
      <DrawerEmptyState
        className='min-h-[48px] px-0'
        message='No track data available.'
      />
    );
  }

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
            tracks,
            totalTracks: release.totalTracks,
          })}
          release={release}
          playbackState={playbackState}
          onToggleTrack={toggleTrack}
          isLastRow={index === tracks.length - 1}
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
  onToggleTrack,
  isLastRow,
}: {
  readonly track: ReleaseSidebarTrack;
  readonly trackLabel: string;
  readonly release: Release;
  readonly playbackState: {
    activeTrackId: string | null;
    isPlaying: boolean;
    playbackStatus?: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  };
  readonly onToggleTrack: (track: TrackControlSource) => Promise<void>;
  readonly isLastRow: boolean;
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

    onToggleTrack({
      id: track.id,
      title: track.title,
      audioUrl: playableUrl,
      isrc: track.isrc,
      releaseTitle: release.title,
      artistName: release.artistNames?.[0],
      artworkUrl: release.artworkUrl,
    }).catch(() => {
      toast.error('Unable to play this track right now');
    });
  }, [
    isActiveTrack,
    onToggleTrack,
    playableUrl,
    release.artistNames,
    release.artworkUrl,
    release.title,
    track.id,
    track.isrc,
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

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5',
        !isLastRow &&
          'border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_58%,transparent)]'
      )}
      data-testid={`release-track-row-${track.id}`}
    >
      <button
        type='button'
        onClick={handleTogglePlayback}
        disabled={!playableUrl && !isActiveTrack}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-[510] tabular-nums transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
          isActiveTrack
            ? 'border border-(--linear-app-frame-seam) bg-surface-0 text-primary-token hover:bg-surface-1'
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

      <div className='min-w-0 flex-1'>
        <p className='truncate text-[12.5px] font-[510] leading-tight text-primary-token'>
          {track.title}
        </p>
      </div>

      {trackDuration ? (
        <span className='shrink-0 text-[11px] tabular-nums text-tertiary-token'>
          {trackDuration}
        </span>
      ) : null}
    </div>
  );
}
