'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { captureTrackPlayback } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';

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
          artistName: DEMO_PLAYER_RELEASE.artistNames.join(' & '),
          artworkUrl: DEMO_PLAYER_RELEASE.artworkUrl,
        },
        (DEMO_PLAYER_RELEASE.totalDurationMs ?? 0) / 1000,
        currentTime
      ),
    [currentTime]
  );
  return null;
}
