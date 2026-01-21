'use client';

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
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
export function ReleaseCell({ release, artistName }: ReleaseCellProps) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const manualOverrideCount = release.providers.filter(
    provider => provider.source === 'manual'
  ).length;

  // Check if title is truncated
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [release.title]);

  const titleElement = (
    <span
      ref={titleRef}
      tabIndex={isTruncated ? 0 : undefined}
      className='line-clamp-1 text-sm font-semibold text-primary-token rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    >
      {release.title}
    </span>
  );

  return (
    <div className='flex items-center gap-3'>
      {/* Artwork thumbnail */}
      <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-surface-2 shadow-sm'>
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
          {isTruncated ? (
            <Tooltip>
              <TooltipTrigger asChild>{titleElement}</TooltipTrigger>
              <TooltipContent side='top' align='start'>
                {release.title}
              </TooltipContent>
            </Tooltip>
          ) : (
            titleElement
          )}
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
          <div className='mt-0.5 line-clamp-1 text-xs text-secondary-token'>
            {artistName}
          </div>
        )}
      </div>
    </div>
  );
}
