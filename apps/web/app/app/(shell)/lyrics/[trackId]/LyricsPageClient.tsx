'use client';

import { useCallback, useState } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { type LyricLine, LyricsView } from '@/components/shell/LyricsView';
import { MOCK_LYRICS } from '@/data/mock-lyrics';

/**
 * Client wrapper for the lyrics route.
 *
 * Wires the global audio player into LyricsView. `trackId` is accepted for
 * future per-track lyric storage but currently unused — production has no
 * `getLyricsByTrackId(trackId)` query yet, so the surface ships with
 * placeholder lyrics bound to whatever's playing globally.
 */
export function LyricsPageClient({
  trackId: _trackId,
}: {
  readonly trackId: string;
}) {
  const { playbackState, seek } = useTrackAudioPlayer();
  const [lines, setLines] = useState<LyricLine[]>(() => [...MOCK_LYRICS]);

  const handleLinesChange = useCallback((next: LyricLine[]) => {
    setLines(next);
  }, []);

  const track = {
    title: playbackState.trackTitle ?? 'No track playing',
    artist: playbackState.artistName ?? '—',
  };

  return (
    <LyricsView
      track={track}
      durationSec={playbackState.duration}
      currentTimeSec={playbackState.currentTime}
      lines={lines}
      onLinesChange={handleLinesChange}
      onSeek={seek}
    />
  );
}
