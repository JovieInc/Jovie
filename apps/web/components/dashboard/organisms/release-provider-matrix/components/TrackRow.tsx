'use client';

import { Badge } from '@jovie/ui';
import { memo, useMemo } from 'react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { DspProviderIcon } from '@/components/dashboard/atoms/DspProviderIcon';
import { PROVIDER_TO_DSP } from '@/lib/discography/provider-domains';
import type { ProviderKey, TrackViewModel } from '@/lib/discography/types';
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
}: TrackRowProps) {
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

  return (
    <tr className='group bg-surface-1/50 hover:bg-surface-1 border-l-2 border-l-transparent'>
      {/* 1. Spacer for checkbox column (always visible) */}
      {isVisible('select') && <td className='w-14' />}

      {/* 2. Track info - spans the release column width (always visible) */}
      {isVisible('release') && (
        <td className='py-2 pr-4'>
          <div className='flex items-center gap-3 pl-8'>
            {/* Track number */}
            <span className='w-8 shrink-0 text-right text-xs tabular-nums text-tertiary-token'>
              {trackLabel}.
            </span>

            {/* Track title with explicit badge */}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <TruncatedText
                  lines={1}
                  className='text-sm text-primary-token'
                  tooltipSide='top'
                  tooltipAlign='start'
                >
                  {track.title}
                </TruncatedText>
                {track.isExplicit && (
                  <Badge
                    variant='secondary'
                    className='shrink-0 bg-surface-2 px-1 py-0 text-[10px] text-tertiary-token'
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
              <>
                <div className='flex -space-x-1'>
                  {linkedProviders.slice(0, 4).map(providerKey => {
                    const config = providerConfig[providerKey];
                    const dspId = PROVIDER_TO_DSP[providerKey];

                    return (
                      <div
                        key={providerKey}
                        className='relative flex h-4 w-4 items-center justify-center rounded-full border border-subtle bg-surface-1'
                        title={config.label}
                      >
                        {dspId ? (
                          <DspProviderIcon provider={dspId} size='sm' />
                        ) : (
                          <span
                            className='h-2 w-2 rounded-full'
                            style={{ backgroundColor: config.accent }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <span className='text-xs text-tertiary-token'>
                  {availableCount}/{allProviders.length}
                </span>
              </>
            ) : (
              <span className='text-xs text-tertiary-token'>—</span>
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
            <span className='text-xs text-secondary-token tabular-nums'>
              {formatDuration(track.durationMs)}
            </span>
          ) : (
            <span className='text-xs text-tertiary-token'>—</span>
          )}
        </td>
      )}

      {/* 8. Popularity spacer */}
      {isVisible('popularity') && <td />}

      {/* 9. ISRC */}
      {isVisible('primaryIsrc') && (
        <td className='py-2'>
          <CopyableMonospaceCell value={track.isrc} label='ISRC' />
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
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
  readonly allProviders: ProviderKey[];
  readonly columnCount: number;
  /** Column visibility state from TanStack table */
  readonly columnVisibility?: Record<string, boolean>;
}

export const TrackRowsContainer = memo(function TrackRowsContainer({
  tracks,
  providerConfig,
  allProviders,
  columnCount,
  columnVisibility,
}: TrackRowsContainerProps) {
  if (tracks.length === 0) {
    return (
      <tr className='bg-surface-1/50'>
        <td
          colSpan={columnCount}
          className='py-3 pl-20 text-xs text-tertiary-token'
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
        />
      ))}
    </>
  );
});
