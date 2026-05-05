'use client';

import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import {
  type LyricLine,
  LyricsView,
  type LyricsViewTrack,
} from '@/components/shell/LyricsView';

/**
 * Client wrapper for the lyrics route.
 *
 * Wires the global audio player into LyricsView. Lyrics are read-only here:
 * if the server cannot resolve DB-backed lyrics, the view intentionally shows
 * the production empty state instead of demo lyric content.
 */
export function LyricsPageClient({
  initialLines,
  initialTrack,
  initialDurationSec,
  trackId,
}: {
  readonly initialLines: readonly LyricLine[];
  readonly initialTrack: LyricsViewTrack;
  readonly initialDurationSec: number;
  readonly trackId: string;
}) {
  const { playbackState, seek } = useTrackAudioPlayer();
  const isActive = playbackState.activeTrackId === trackId;

  const track = {
    title:
      isActive && playbackState.trackTitle
        ? playbackState.trackTitle
        : initialTrack.title,
    artist:
      isActive && playbackState.artistName
        ? playbackState.artistName
        : initialTrack.artist,
  };

  // Prefer the live audio element's duration when this track is the active
  // playback target; otherwise fall back to the persisted track length so
  // the surface still shows duration on cold loads.
  const durationSec = isActive ? playbackState.duration : initialDurationSec;
  const currentTimeSec = isActive ? playbackState.currentTime : 0;

  return (
    <LyricsView
      track={track}
      durationSec={durationSec}
      currentTimeSec={currentTimeSec}
      lines={initialLines}
      onSeek={seek}
      timed={false}
    />
  );
}
