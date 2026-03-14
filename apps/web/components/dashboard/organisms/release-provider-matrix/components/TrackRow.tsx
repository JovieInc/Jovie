'use client';

import { Badge } from '@jovie/ui';
import { Pause, Play } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import { Icon } from '@/components/atoms/Icon';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { CompactLinkRail } from '@/components/molecules/CompactLinkRail';
import type { TrackSidebarData } from '@/components/organisms/release-sidebar';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import type {
  ProviderKey,
  ReleaseViewModel,
  TrackViewModel,
} from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';

interface ProviderConfig {
  label: string;
  accent: string;
}

interface TrackRowProps {
  readonly track: TrackViewModel;
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
  readonly allProviders: ProviderKey[];
  /** Number of visible columns (for proper spacing) */
  readonly columnCount: number;
  /** Column visibility state from TanStack table */
  readonly columnVisibility?: Record<string, boolean>;
  readonly isSelected?: boolean;
  readonly onClick?: () => void;
}

/**
 * TrackRow - Displays a track within an expanded release
 *
 * Features:
 * - Indented layout with track number prefix
 * - Lighter background to distinguish from release rows
 * - Shows: track number, title, duration, ISRC
 * - Provider availability dots (compact)
 * - Explicit badge if applicable
 */
export const TrackRow = memo(function TrackRow({
  track,
  providerConfig,
  allProviders,
  columnCount,
  columnVisibility,
  isSelected,
  onClick,
}: TrackRowProps) {
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const rowStateClassName = isSelected
    ? 'bg-(--linear-bg-surface-1) shadow-[inset_2px_0_0_0_var(--linear-border-focus),inset_0_0_0_1px_var(--linear-border-subtle)] hover:bg-(--linear-bg-surface-1)'
    : 'bg-transparent hover:bg-(--linear-bg-surface-1) transition-[background-color,box-shadow] duration-150 ease-out';

  const rowClassName = [
    'group rounded-[8px]',
    onClick ? 'cursor-pointer' : '',
    rowStateClassName,
  ]
    .filter(Boolean)
    .join(' ');

  // Helper to check if a column is visible
  const isVisible = (id: string) => columnVisibility?.[id] !== false;
  // Format track number with disc number if multi-disc
  const trackLabel =
    track.discNumber > 1
      ? `${track.discNumber}-${track.trackNumber}`
      : String(track.trackNumber);

  // Create provider Map for O(1) lookups
  const providerMap = useMemo(() => {
    const map = new Map<ProviderKey, (typeof track.providers)[number]>();
    for (const provider of track.providers) {
      map.set(provider.key, provider);
    }
    return map;
  }, [track]);

  // Count available providers
  const availableCount = track.providers.filter(p => p.url).length;

  // Get linked providers for compact display (only show providers with URLs)
  const linkedProviders = useMemo(() => {
    return allProviders.filter(key => {
      const provider = providerMap.get(key);
      return provider?.url;
    });
  }, [allProviders, providerMap]);

  const previewUrl = track.previewUrl || track.audioUrl;
  const canPlay = Boolean(previewUrl);
  const isActiveTrack = playbackState.activeTrackId === track.id;
  const isPlaying = isActiveTrack && playbackState.isPlaying;

  const handleTogglePlayback = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!previewUrl) return;
      toggleTrack({
        id: track.id,
        title: track.title,
        audioUrl: previewUrl,
      }).catch(() => {});
    },
    [previewUrl, toggleTrack, track.id, track.title]
  );

  return (
    <tr className={rowClassName} onClick={onClick}>
      {/* 1. Spacer for checkbox column (always visible) */}
      {isVisible('select') && (
        <td className='w-14 py-2'>
          <div className='flex items-center justify-center'>
            {canPlay ? (
              <button
                type='button'
                onClick={handleTogglePlayback}
                className='flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-(--linear-text-secondary) transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-0) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
                aria-label={
                  isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
                }
              >
                {isPlaying ? (
                  <Pause className='h-3 w-3' />
                ) : (
                  <Play className='h-3 w-3' />
                )}
              </button>
            ) : null}
          </div>
        </td>
      )}

      {/* 2. Track info - spans the release column width (always visible) */}
      {isVisible('release') && (
        <td className='py-2 pr-4'>
          <div className='flex items-center gap-2.5 pl-6'>
            {/* Track number */}
            <span className='w-7 shrink-0 text-right text-[11px] tabular-nums text-(--linear-text-tertiary)'>
              {trackLabel}.
            </span>

            {/* Track title with explicit badge */}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <TruncatedText
                  lines={1}
                  className='text-[13px] text-(--linear-text-primary)'
                  tooltipSide='top'
                  tooltipAlign='start'
                >
                  {track.title}
                </TruncatedText>
                {track.isExplicit && (
                  <Badge
                    variant='secondary'
                    className='shrink-0 border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-1 py-0 text-[9px] text-(--linear-text-tertiary)'
                  >
                    E
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </td>
      )}

      {/* 3. Type column spacer */}
      {isVisible('releaseType') && <td />}

      {/* 4. Availability - compact provider dots */}
      {isVisible('availability') && (
        <td className='py-2'>
          <div className='flex items-center gap-2'>
            {linkedProviders.length > 0 ? (
              <CompactLinkRail
                items={linkedProviders.slice(0, 4).map(providerKey => ({
                  id: providerKey,
                  platformIcon: providerKey,
                  platformName: providerConfig[providerKey].label,
                  primaryText: providerConfig[providerKey].label,
                  summaryIcon: (
                    <ProviderIcon
                      provider={providerKey}
                      className='h-2.5 w-2.5'
                      aria-hidden='true'
                    />
                  ),
                }))}
                countLabel='track DSP links'
                summaryCount={availableCount}
                summaryAriaLabel={`${availableCount} of ${allProviders.length} track DSP links`}
                maxVisible={4}
                className='justify-start'
                railClassName='max-w-[132px] lg:max-w-[164px]'
              />
            ) : (
              <span className='text-[11px] text-(--linear-text-tertiary)'>
                —
              </span>
            )}
          </div>
        </td>
      )}

      {/* 5. Smart link spacer */}
      {isVisible('smartLink') && <td />}

      {/* 6. Release date spacer */}
      {isVisible('releaseDate') && <td />}

      {/* 7. Metrics - only duration for tracks */}
      {isVisible('metrics') && (
        <td className='py-2'>
          {track.durationMs ? (
            <span className='text-[11px] tabular-nums text-(--linear-text-secondary)'>
              {formatDuration(track.durationMs)}
            </span>
          ) : (
            <span className='text-[11px] text-(--linear-text-tertiary)'>—</span>
          )}
        </td>
      )}

      {/* 8. Popularity spacer */}
      {isVisible('popularity') && <td />}

      {/* 9. ISRC */}
      {isVisible('primaryIsrc') && (
        <td className='py-2'>
          <CopyableMonospaceCell value={track.isrc} label='ISRC' size='sm' />
        </td>
      )}

      {/* 10. UPC spacer */}
      {isVisible('upc') && <td />}

      {/* 11. Actions spacer (always visible) */}
      {isVisible('actions') && <td />}
    </tr>
  );
});

/**
 * TrackRowsContainer - Renders track rows for an expanded release
 */
interface TrackRowsContainerProps {
  readonly tracks: TrackViewModel[];
  readonly release?: ReleaseViewModel;
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
  readonly allProviders: ProviderKey[];
  readonly columnCount: number;
  readonly columnVisibility?: Record<string, boolean>;
  readonly onTrackClick?: (trackData: TrackSidebarData) => void;
  readonly selectedTrackId?: string | null;
}

export const TrackRowsContainer = memo(function TrackRowsContainer({
  tracks,
  release,
  providerConfig,
  allProviders,
  columnCount,
  columnVisibility,
  onTrackClick,
  selectedTrackId,
}: TrackRowsContainerProps) {
  const handleTrackClick = useCallback(
    (track: TrackViewModel) => {
      if (!onTrackClick || !release) return;
      onTrackClick({
        id: track.id,
        title: track.title,
        slug: track.slug,
        smartLinkPath: track.smartLinkPath,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber,
        durationMs: track.durationMs,
        isrc: track.isrc,
        isExplicit: track.isExplicit,
        previewUrl: track.previewUrl,
        audioUrl: track.audioUrl,
        audioFormat: track.audioFormat,
        providers: track.providers,
        releaseTitle: release.title,
        releaseArtworkUrl: release.artworkUrl,
        releaseId: release.id,
      });
    },
    [onTrackClick, release]
  );

  if (tracks.length === 0) {
    return (
      <tr className='bg-(--linear-bg-surface-1)/60'>
        <td
          colSpan={columnCount}
          className='py-3 pl-20 text-[11px] text-(--linear-text-tertiary)'
        >
          <div className='flex items-center gap-2'>
            <Icon name='AlertCircle' className='h-3.5 w-3.5' />
            <span>No tracks found for this release</span>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      {tracks.map(track => (
        <TrackRow
          key={track.id}
          track={track}
          providerConfig={providerConfig}
          allProviders={allProviders}
          columnCount={columnCount}
          columnVisibility={columnVisibility}
          isSelected={selectedTrackId === track.id}
          onClick={onTrackClick ? () => handleTrackClick(track) : undefined}
        />
      ))}
    </>
  );
});
