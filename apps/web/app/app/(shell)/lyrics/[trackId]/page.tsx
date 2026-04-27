'use client';

import { useCallback, useState } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { type LyricLine, LyricsView } from '@/components/shell/LyricsView';
import { MOCK_LYRICS } from '@/data/mock-lyrics';

/**
 * Lyrics route — track-scoped cinematic lyrics surface.
 *
 * `[trackId]` resolution to a real track is deferred — production today
 * has no `getTrackById` query. This page renders the surface bound to
 * the global audio player's currently-playing track + a placeholder
 * lyric set. When per-track lyric storage lands, swap MOCK_LYRICS for
 * `getLyricsByTrackId(trackId)` and the playback hook supplies real
 * track metadata.
 */
export default function LyricsPage({
  params: _params,
}: {
  params: { trackId: string };
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
