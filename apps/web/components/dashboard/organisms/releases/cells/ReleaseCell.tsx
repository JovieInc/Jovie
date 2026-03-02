'use client';

import { Badge } from '@jovie/ui';
import { memo } from 'react';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { PopularityIcon } from './PopularityIcon';

interface ReleaseCellProps {
  readonly release: ReleaseViewModel;
  readonly artistName?: string | null;
  /** Whether to show release type inline (when type column is hidden) */
  readonly showType?: boolean;
}

/**
 * ReleaseCell - Displays release title and artist name
 *
 * Shows:
 * - Release title with tooltip (only when truncated)
 * - Release type badge (Single, EP, Album, etc.)
 * - Popularity signal-bars icon
 * - Optional "edited" badge if manual overrides exist
 * - Artist name if provided
 */
export const ReleaseCell = memo(function ReleaseCell({
  release,
  artistName,
  showType = true,
}: ReleaseCellProps) {
  const manualOverrideCount = release.providers.filter(
    provider => provider.source === 'manual'
  ).length;

  const typeStyle = release.releaseType
    ? getReleaseTypeStyle(release.releaseType)
    : null;

  return (
    <div className='flex items-center gap-3'>
      {/* Title and metadata */}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <TruncatedText
            lines={1}
            className='text-sm font-semibold text-primary-token'
            tooltipSide='top'
            tooltipAlign='start'
          >
            {release.title}
          </TruncatedText>
          {showType && typeStyle && (
            <Badge
              size='sm'
              className={`shrink-0 rounded-full ${typeStyle.border} ${typeStyle.bg} ${typeStyle.text}`}
            >
              {typeStyle.label}
            </Badge>
          )}
          <PopularityIcon popularity={release.spotifyPopularity} />
          {/* Year - mobile only (meta column is hidden on mobile) */}
          {release.releaseDate && (
            <span className='shrink-0 text-[10px] tabular-nums text-tertiary-token sm:hidden'>
              {new Date(release.releaseDate).getFullYear()}
            </span>
          )}
          {manualOverrideCount > 0 && (
            <Badge
              variant='secondary'
              className='shrink-0 border border-warning bg-warning-subtle text-[10px] text-warning-foreground'
            >
              {manualOverrideCount} edited
            </Badge>
          )}
        </div>
        {artistName && (
          <TruncatedText
            lines={1}
            className='mt-0.5 text-xs text-secondary-token'
          >
            {artistName}
          </TruncatedText>
        )}
      </div>
    </div>
  );
});
