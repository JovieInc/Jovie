'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  requestFullAudioPlayer,
  useAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';
import { captureTrackPlayback } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import { formatReleaseArtistLine } from '@/lib/discography/formatting';

// Reuse the canonical real release, artwork and duration, never invented UI.
export const DEMO_PLAYER_RELEASE = FOUNDER_DEMO_PERSONA.releases[0];

export function DemoPlayerCapture() {
  const timestamp = useSearchParams().get('playerTimestamp') ?? '1:18';
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(timestamp);
  const currentTime = match ? Number(match[1]) * 60 + Number(match[2]) : 78;
  useEffect(
    () =>
      captureTrackPlayback(
        {
          id: DEMO_PLAYER_RELEASE.id,
          title: DEMO_PLAYER_RELEASE.title,
          releaseTitle: DEMO_PLAYER_RELEASE.title,
          artistName:
            formatReleaseArtistLine(DEMO_PLAYER_RELEASE.artistNames) ??
            'Unknown artist',
          artworkUrl: DEMO_PLAYER_RELEASE.artworkUrl,
        },
        (DEMO_PLAYER_RELEASE.totalDurationMs ?? 0) / 1000,
        currentTime
      ),
    [currentTime]
  );
  // A play lands in the sidebar O and leaves the full player closed (#26754).
  // The capture exists to show the open dock, so once the lazily mounted
  // player reports this track, ask it to open, once, the same way the O's
  // Show Player does. A later close is left alone.
  const { activeTrackId, fullPlayerVisible } = useAudioChromeSnapshot();
  const openRequestedRef = useRef(false);
  useEffect(() => {
    if (openRequestedRef.current) return;
    if (activeTrackId !== DEMO_PLAYER_RELEASE.id || fullPlayerVisible) return;
    openRequestedRef.current = true;
    requestFullAudioPlayer();
  }, [activeTrackId, fullPlayerVisible]);
  return null;
}
