'use client';

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { loadTracksForRelease } from '@/app/app/(shell)/dashboard/releases/actions';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { DrawerSection } from '@/components/molecules/drawer';
import type { TrackViewModel } from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import type { Release } from './types';

interface ReleaseTrackListProps {
  readonly release: Release;
  readonly onTrackClick?: (track: TrackViewModel) => void;
}

export function ReleaseTrackList({
  release,
  onTrackClick,
}: ReleaseTrackListProps) {
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
            tracks.map(track => (
              <TrackItem key={track.id} track={track} onClick={onTrackClick} />
            ))}
        </div>
      )}
    </DrawerSection>
  );
}

function TrackItem({
  track,
  onClick,
}: {
  readonly track: TrackViewModel;
  readonly onClick?: (track: TrackViewModel) => void;
}) {
  const trackLabel =
    track.discNumber > 1
      ? `${track.discNumber}-${track.trackNumber}`
      : String(track.trackNumber);

  const handleClick = useCallback(() => {
    onClick?.(track);
  }, [onClick, track]);

  const handleCopyIsrc = useCallback(() => {
    if (track.isrc) {
      navigator.clipboard.writeText(track.isrc);
      toast.success('ISRC copied');
    }
  }, [track.isrc]);

  const handleCopySmartLink = useCallback(() => {
    const smartLinkUrl = `${getBaseUrl()}${track.smartLinkPath}`;
    navigator.clipboard.writeText(smartLinkUrl);
    toast.success('Smart link copied');
  }, [track.smartLinkPath]);

  const streamingProviders = track.providers.filter(p => p.url);

  return (
    <div className='group flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2/50 transition-colors'>
      {/* Track number */}
      <span className='w-6 shrink-0 pt-0.5 text-right text-xs tabular-nums text-tertiary-token'>
        {trackLabel}.
      </span>

      {/* Track details - clickable */}
      <button
        type='button'
        onClick={handleClick}
        className='min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded'
      >
        <div className='flex items-center gap-1.5'>
          <TruncatedText
            lines={1}
            className='text-xs text-primary-token hover:underline'
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
              <span className='font-mono text-[10px]'>{track.isrc}</span>
            </>
          )}
        </div>
      </button>

      {/* Actions menu */}
      <TrackActionsMenu
        track={track}
        streamingProviders={streamingProviders}
        onCopyIsrc={handleCopyIsrc}
        onCopySmartLink={handleCopySmartLink}
      />
    </div>
  );
}

/** Provider label mapping for streaming platform names */
const PROVIDER_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube: 'YouTube Music',
  soundcloud: 'SoundCloud',
  deezer: 'Deezer',
  tidal: 'Tidal',
  amazon_music: 'Amazon Music',
  bandcamp: 'Bandcamp',
  beatport: 'Beatport',
};

function TrackActionsMenu({
  track,
  streamingProviders,
  onCopyIsrc,
  onCopySmartLink,
}: {
  readonly track: TrackViewModel;
  readonly streamingProviders: TrackViewModel['providers'];
  readonly onCopyIsrc: () => void;
  readonly onCopySmartLink: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
          aria-label={`Actions for ${track.title}`}
        >
          <MoreHorizontal className='h-3.5 w-3.5 text-tertiary-token' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        {track.isrc && (
          <DropdownMenuItem onClick={onCopyIsrc}>
            <Copy className='mr-2 h-3.5 w-3.5' />
            Copy ISRC
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onCopySmartLink}>
          <Link2 className='mr-2 h-3.5 w-3.5' />
          Copy smart link
        </DropdownMenuItem>
        {streamingProviders.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ExternalLink className='mr-2 h-3.5 w-3.5' />
                Open on platform
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {streamingProviders.map(provider => (
                  <DropdownMenuItem
                    key={provider.key}
                    onClick={() =>
                      globalThis.open(
                        provider.url,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    {PROVIDER_LABELS[provider.key] ?? provider.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
