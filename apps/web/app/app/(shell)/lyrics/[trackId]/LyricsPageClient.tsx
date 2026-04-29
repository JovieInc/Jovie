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
  trackId,
}: {
  readonly initialLines: readonly LyricLine[];
  readonly initialTrack: LyricsViewTrack;
  readonly trackId: string;
}) {
  const { playbackState, seek } = useTrackAudioPlayer();

  const track = {
    title:
      playbackState.activeTrackId === trackId && playbackState.trackTitle
        ? playbackState.trackTitle
        : initialTrack.title,
    artist:
      playbackState.activeTrackId === trackId && playbackState.artistName
        ? playbackState.artistName
        : initialTrack.artist,
  };

  return (
    <LyricsView
      track={track}
      durationSec={playbackState.duration}
      currentTimeSec={playbackState.currentTime}
      lines={initialLines}
      onSeek={seek}
      timed={false}
    />
  );
}
