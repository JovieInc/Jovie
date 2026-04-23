'use client';

import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import { StaticListenInterface } from '../StaticListenInterface';

export interface ListenViewProps {
  readonly artist: Artist;
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
}

/**
 * Body of the `listen` mode: rows of DSP links with deep-link handoff.
 *
 * Pure view component — no title or shell. The enclosing wrapper owns chrome.
 */
export function ListenView({
  artist,
  dsps,
  enableDynamicEngagement = false,
}: ListenViewProps) {
  return (
    <div className='flex justify-center'>
      <StaticListenInterface
        artist={artist}
        handle={artist.handle}
        dspsOverride={dsps}
        enableDynamicEngagement={enableDynamicEngagement}
      />
    </div>
  );
}
