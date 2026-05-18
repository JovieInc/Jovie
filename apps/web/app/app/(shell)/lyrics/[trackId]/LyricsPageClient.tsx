'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import {
  type LyricLine,
  LyricsView,
  type LyricsViewTrack,
} from '@/components/shell/LyricsView';
import { APP_ROUTES, resolveLyricsReturnRoute } from '@/constants/routes';
import { isFormElement } from '@/lib/utils/keyboard';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playbackState, seek } = useTrackAudioPlayer();
  const isActive = playbackState.activeTrackId === trackId;
  const returnRoute = useMemo(
    () =>
      resolveLyricsReturnRoute(searchParams.get('from'), APP_ROUTES.LIBRARY),
    [searchParams]
  );

  useEffect(() => {
    if (isActive) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.key !== 'Escape' ||
        isFormElement(event.target)
      ) {
        return;
      }

      event.preventDefault();
      router.push(returnRoute);
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [isActive, returnRoute, router]);

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
  // playback target AND the audio element has finished resolving its
  // duration. The element reports `duration === 0` until `loadedmetadata`
  // fires, so check `> 0` to avoid a momentary regression to 0 when
  // playback first starts.
  const durationSec =
    isActive && playbackState.duration > 0
      ? playbackState.duration
      : initialDurationSec;
  const currentTimeSec = isActive ? playbackState.currentTime : 0;

  return (
    <LyricsView
      track={track}
      durationSec={durationSec}
      currentTimeSec={currentTimeSec}
      lines={initialLines}
      onSeek={seek}
      timed={false}
      autoFocusView
    />
  );
}
