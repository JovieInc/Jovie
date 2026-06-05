'use client';

import { Badge } from '@jovie/ui';
import { Pause, Play, VolumeX } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';

interface ProviderConfig {
  label: string;
  accent: string;
}

interface TrackRowProps {
  readonly track: TrackViewModel;
  readonly release?: ReleaseViewModel;
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
  readonly allProviders: ProviderKey[];
  /** Number of visible columns (for proper spacing) */
  readonly columnCount: number;
  /** Column visibility state from TanStack table */
  readonly columnVisibility?: Record<string, boolean>;
  readonly isSelected?: boolean;
  readonly onClick?: () => void;
  readonly renderMode?: 'table' | 'stack';
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
  release,
  providerConfig,
  allProviders,
  columnCount,
  columnVisibility,
  isSelected,
  onClick,
  renderMode = 'table',
}: TrackRowProps) {
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const rowClassName = [
    'system-b-track-row group',
    isSelected ? 'system-b-track-row--selected' : 'system-b-track-row--idle',
    onClick ? 'cursor-pointer' : '',
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
        releaseTitle: release?.title,
        artistName: release?.artistNames?.[0],
        artworkUrl: release?.artworkUrl,
        hasLyrics: Boolean(track.lyrics?.trim()),
      }).catch(() => {});
    },
    [
      previewUrl,
      toggleTrack,
      track.id,
      track.title,
      track.lyrics,
      release?.title,
      release?.artistNames,
      release?.artworkUrl,
    ]
  );

  const playbackButton = canPlay ? (
    <button
      type='button'
      onClick={handleTogglePlayback}
      className='focus-ring-transparent-offset flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-secondary-token transition-colors duration-subtle hover:border-subtle hover:bg-surface-0 hover:text-primary-token'
      aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
    >
      {isPlaying ? (
        <Pause className='h-3.5 w-3.5' />
      ) : (
        <Play className='h-3.5 w-3.5' />
      )}
    </button>
  ) : (
    <span className='system-b-track-row-preview-unavailable flex h-7 w-7 items-center justify-center rounded-full text-secondary-token/80'>
      <VolumeX className='h-3.5 w-3.5' aria-label='No preview available' />
    </span>
  );

  if (renderMode === 'stack') {
    const stackClassName = cn(
      'system-b-track-row-stack-card group w-full p-3 text-left',
      isSelected
        ? 'system-b-track-row-stack-card--selected'
        : 'system-b-track-row-stack-card--idle'
    );

    const titleRow = (
      <div className='flex items-center gap-2'>
        <span className='text-2xs tabular-nums text-tertiary-token'>
          {trackLabel}.
        </span>
        <TruncatedText
          lines={1}
          className='text-xs font-caption text-primary-token'
          tooltipSide='top'
          tooltipAlign='start'
        >
          {track.title}
        </TruncatedText>
        {track.isExplicit ? (
          <Badge
            variant='secondary'
            className='shrink-0 border border-subtle bg-surface-1 px-1 py-0 text-3xs text-tertiary-token'
            title='Explicit content'
            aria-label='Explicit content'
          >
            E
          </Badge>
        ) : null}
      </div>
    );

    const stackContent = (
      <div className='flex items-start gap-3'>
        <div className='pt-0.5'>{playbackButton}</div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              {onClick ? (
                <button
                  type='button'
                  onClick={onClick}
                  className='focus-ring-transparent-offset min-w-0 rounded-lg text-left'
                  aria-label={`Open details for ${track.title}`}
                >
                  {titleRow}
                </button>
              ) : (
                titleRow
              )}
              <div className='mt-2 flex flex-wrap items-center gap-2'>
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
                    railClassName='system-b-track-row-stack-rail'
                  />
                ) : (
                  <span className='text-2xs text-tertiary-token'>
                    No DSP links
                  </span>
                )}
                <span className='text-2xs text-secondary-token'>
                  {track.durationMs ? formatDuration(track.durationMs) : '—'}
                </span>
              </div>
            </div>

            <div className='shrink-0 pt-0.5'>
              <CopyableMonospaceCell
                value={track.isrc}
                label='ISRC'
                size='sm'
              />
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <div
        className={stackClassName}
        data-testid={`track-row-${track.id}`}
        data-state={isSelected ? 'selected' : 'idle'}
      >
        {stackContent}
      </div>
    );
  }

  return (
    <tr
      className={rowClassName}
      onClick={onClick}
      data-testid={`track-row-${track.id}`}
      data-state={isSelected ? 'selected' : 'idle'}
    >
      {/* 1. Spacer for checkbox column (always visible) */}
      {isVisible('select') && (
        <td className='w-14 py-2 align-top'>
          <div className='flex items-center justify-center'>
            {playbackButton}
          </div>
        </td>
      )}

      {/* 2. Track info - spans the release column width (always visible) */}
      {isVisible('release') && (
        <td className='py-2 pr-3 align-top'>
          <div className='relative flex items-center gap-2.5 pl-5'>
            <span
              aria-hidden='true'
              className='system-b-track-row-release-rail absolute left-2 top-0.5 bottom-0.5 w-px rounded-full'
            />
            {/* Track number */}
            <span className='w-7 shrink-0 text-right text-2xs tabular-nums text-tertiary-token'>
              {trackLabel}.
            </span>

            {/* Track title with explicit badge */}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <TruncatedText
                  lines={1}
                  className='text-xs font-caption text-primary-token'
                  tooltipSide='top'
                  tooltipAlign='start'
                >
                  {track.title}
                </TruncatedText>
                {track.isExplicit && (
                  <Badge
                    variant='secondary'
                    className='shrink-0 border border-subtle bg-surface-1 px-1 py-0 text-3xs text-tertiary-token'
                    title='Explicit content'
                    aria-label='Explicit content'
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
        <td className='py-2 align-top'>
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
                railClassName='system-b-track-row-table-rail'
              />
            ) : (
              <span className='text-2xs text-tertiary-token'>—</span>
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
        <td className='py-2 align-top'>
          {track.durationMs ? (
            <span className='text-2xs tabular-nums text-secondary-token'>
              {formatDuration(track.durationMs)}
            </span>
          ) : (
            <span className='text-2xs text-tertiary-token'>—</span>
          )}
        </td>
      )}

      {/* 8. Popularity spacer */}
      {isVisible('popularity') && <td />}

      {/* 9. ISRC */}
      {isVisible('primaryIsrc') && (
        <td className='py-2 align-top'>
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
  readonly renderMode?: 'table' | 'stack';
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
  renderMode = 'table',
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
        lyrics: track.lyrics,
        previewSource: track.previewSource,
        previewVerification: track.previewVerification,
        providerConfidenceSummary: track.providerConfidenceSummary,
        providers: track.providers,
        releaseTitle: release.title,
        releaseArtworkUrl: release.artworkUrl,
        releaseId: release.id,
      });
    },
    [onTrackClick, release]
  );

  if (tracks.length === 0) {
    if (renderMode === 'stack') {
      return (
        <div className='system-b-track-row-empty-stack flex items-center gap-2 px-3 py-2.5 text-2xs text-tertiary-token'>
          <Icon name='AlertCircle' className='h-3.5 w-3.5' />
          <span>No tracks found for this release</span>
        </div>
      );
    }

    return (
      <tr className='system-b-track-row-empty-table'>
        <td
          colSpan={columnCount}
          className='py-2.5 pl-20 text-2xs text-tertiary-token'
        >
          <div className='flex items-center gap-2'>
            <Icon name='AlertCircle' className='h-3.5 w-3.5' />
            <span>No tracks found for this release</span>
          </div>
        </td>
      </tr>
    );
  }

  if (renderMode === 'stack') {
    return (
      <div className='space-y-2'>
        {tracks.map(track => (
          <TrackRow
            key={track.id}
            track={track}
            release={release}
            providerConfig={providerConfig}
            allProviders={allProviders}
            columnCount={columnCount}
            columnVisibility={columnVisibility}
            isSelected={selectedTrackId === track.id}
            onClick={onTrackClick ? () => handleTrackClick(track) : undefined}
            renderMode='stack'
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {tracks.map(track => (
        <TrackRow
          key={track.id}
          track={track}
          release={release}
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
