'use client';

import { Badge } from '@jovie/ui';
import Image from 'next/image';
import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import type { ReleaseViewModel } from '@/lib/discography/types';

interface ReleaseCellProps {
  release: ReleaseViewModel;
  artistName?: string | null;
}

/**
 * ReleaseCell - Displays release artwork, title, and artist name
 *
 * Shows:
 * - Album artwork thumbnail (40x40px)
 * - Release title with tooltip (only when truncated)
 * - Optional "edited" badge if manual overrides exist
 * - Artist name if provided
 */
export const ReleaseCell = memo(function ReleaseCell({
  release,
  artistName,
}: ReleaseCellProps) {
  const manualOverrideCount = release.providers.filter(
    provider => provider.source === 'manual'
  ).length;

  return (
    <div className='flex items-center gap-3'>
      {/* Artwork thumbnail - hidden on mobile to save space */}
      <div className='relative hidden h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-surface-2 shadow-sm sm:block'>
        {release.artworkUrl ? (
          <Image
            src={release.artworkUrl}
            alt={`${release.title} artwork`}
            fill
            className='object-cover'
            sizes='40px'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <Icon
              name='Disc3'
              className='h-5 w-5 text-tertiary-token'
              aria-hidden='true'
            />
          </div>
        )}
      </div>

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
          {manualOverrideCount > 0 && (
            <Badge
              variant='secondary'
              className='shrink-0 border border-(--color-warning) bg-(--color-warning-subtle) text-[10px] text-(--color-warning-foreground)'
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
