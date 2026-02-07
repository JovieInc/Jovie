'use client';

import { Badge } from '@jovie/ui';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { loadTracksForRelease } from '@/app/app/(shell)/dashboard/releases/actions';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { DrawerSection } from '@/components/molecules/drawer';
import type { TrackViewModel } from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { Release } from './types';

interface ReleaseTrackListProps {
  readonly release: Release;
}

export function ReleaseTrackList({ release }: ReleaseTrackListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tracks, setTracks] = useState<TrackViewModel[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleToggle = useCallback(async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);

    // Only fetch if not already cached (null = not fetched, [] = empty)
    if (tracks !== null && !hasError) return;

    setIsLoading(true);
    setHasError(false);
    try {
      const result = await loadTracksForRelease({
        releaseId: release.id,
        releaseSlug: release.slug,
      });
      setTracks(result);
    } catch (error) {
      console.error('Failed to load tracks:', error);
      setTracks(null);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [isExpanded, tracks, hasError, release.id, release.slug]);

  if (release.totalTracks === 0) return null;

  return (
    <DrawerSection>
      <button
        type='button'
        onClick={() => void handleToggle()}
        aria-expanded={isExpanded}
        aria-controls={`release-tracklist-${release.id}`}
        className='flex w-full items-center justify-between rounded-md py-1 text-xs font-semibold uppercase tracking-wide text-secondary-token hover:text-primary-token transition-colors'
      >
        <span>Tracklist ({release.totalTracks})</span>
        {isExpanded ? (
          <ChevronDown className='h-3.5 w-3.5' />
        ) : (
          <ChevronRight className='h-3.5 w-3.5' />
        )}
      </button>

      {isExpanded && (
        <div id={`release-tracklist-${release.id}`} className='space-y-0.5'>
          {isLoading && (
            <div className='flex items-center justify-center py-4'>
              <Loader2 className='h-4 w-4 animate-spin text-tertiary-token' />
            </div>
          )}

          {!isLoading && hasError && (
            <p className='py-2 text-xs text-error'>
              Failed to load tracks. Collapse and expand to retry.
            </p>
          )}

          {!isLoading && !hasError && tracks && tracks.length === 0 && (
            <p className='py-2 text-xs text-tertiary-token'>
              No track data available.
            </p>
          )}

          {!isLoading &&
            !hasError &&
            tracks &&
            tracks.length > 0 &&
            tracks.map(track => <TrackItem key={track.id} track={track} />)}
        </div>
      )}
    </DrawerSection>
  );
}

function TrackItem({ track }: { readonly track: TrackViewModel }) {
  const trackLabel =
    track.discNumber > 1
      ? `${track.discNumber}-${track.trackNumber}`
      : String(track.trackNumber);

  return (
    <div className='group flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2/50 transition-colors'>
      {/* Track number */}
      <span className='w-6 shrink-0 pt-0.5 text-right text-xs tabular-nums text-tertiary-token'>
        {trackLabel}.
      </span>

      {/* Track details */}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1.5'>
          <TruncatedText
            lines={1}
            className='text-xs text-primary-token'
            tooltipSide='top'
          >
            {track.title}
          </TruncatedText>
          {track.isExplicit && (
            <Badge
              variant='secondary'
              className='shrink-0 bg-surface-2 px-1 py-0 text-[9px] text-tertiary-token'
            >
              E
            </Badge>
          )}
        </div>

        {/* Duration + ISRC row */}
        <div className='mt-0.5 flex items-center gap-2 text-[11px] text-tertiary-token'>
          {track.durationMs != null && (
            <span className='tabular-nums'>
              {formatDuration(track.durationMs)}
            </span>
          )}
          {track.isrc && (
            <>
              {track.durationMs != null && (
                <span className='text-tertiary-token/50'>|</span>
              )}
              <CopyableMonospaceCell
                value={track.isrc}
                label='ISRC'
                maxWidth={110}
                className='!text-[11px] !text-tertiary-token hover:!text-secondary-token'
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
