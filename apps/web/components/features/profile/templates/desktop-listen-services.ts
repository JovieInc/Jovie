import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';

/**
 * Props for the desktop listen surface's streaming-service links, shared by the
 * artist-level Listen card and the catalog side rail so both expose every
 * provider the artist has as an individual visible action.
 */
export function listenServiceProps(artist: Artist, dsps: AvailableDSP[]) {
  return {
    artist,
    handle: artist.handle,
    dspsOverride: dsps,
    containerClassName: 'max-w-none',
    providerButtonClassName:
      'rounded-2xl border-white/8 bg-white/[0.045] px-4 py-3.5 text-white dark:text-white hover:bg-white/[0.08]',
    emptyStateClassName:
      'rounded-2xl border-white/8 bg-white/[0.04] shadow-none',
    hideHelpText: true,
  } as const;
}
