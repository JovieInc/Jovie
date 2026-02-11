'use client';

import Image from 'next/image';
import { memo, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

interface MobileReleaseListProps {
  readonly releases: ReleaseViewModel[];
  readonly artistName?: string | null;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly groupByYear?: boolean;
}

interface YearGroup {
  year: string;
  releases: ReleaseViewModel[];
}

function groupReleasesByYear(releases: ReleaseViewModel[]): YearGroup[] {
  const groups = new Map<string, ReleaseViewModel[]>();

  for (const release of releases) {
    const year = release.releaseDate
      ? new Date(release.releaseDate).getFullYear().toString()
      : 'Unknown';
    const group = groups.get(year);
    if (group) {
      group.push(release);
    } else {
      groups.set(year, [release]);
    }
  }

  return Array.from(groups.entries()).map(([year, yearReleases]) => ({
    year,
    releases: yearReleases,
  }));
}

/** Single release row in the mobile list */
const MobileReleaseRow = memo(function MobileReleaseRow({
  release,
  artistName,
  onEdit,
}: {
  readonly release: ReleaseViewModel;
  readonly artistName?: string | null;
  readonly onEdit: (release: ReleaseViewModel) => void;
}) {
  const year = release.releaseDate
    ? new Date(release.releaseDate).getFullYear()
    : null;

  const typeStyle = getReleaseTypeStyle(release.releaseType);

  return (
    <button
      type='button'
      onClick={() => onEdit(release)}
      className='flex w-full items-center gap-3 border-b border-subtle px-4 py-3 text-left transition-colors active:bg-surface-2/50'
    >
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

      {/* Title + metadata */}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-1.5'>
          <TruncatedText
            lines={1}
            className='text-sm font-semibold text-primary-token'
          >
            {release.title}
          </TruncatedText>
          <span
            className={cn(
              'shrink-0 text-[10px] font-medium uppercase tracking-wide',
              typeStyle.text
            )}
          >
            {typeStyle.label}
          </span>
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

      {/* Year on the right */}
      {year && (
        <span className='shrink-0 text-xs tabular-nums text-tertiary-token'>
          {year}
        </span>
      )}

      {/* Chevron indicator */}
      <Icon
        name='ChevronRight'
        className='h-4 w-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
    </button>
  );
});

/** Year group header */
function YearGroupHeader({
  year,
  count,
}: {
  year: string;
  count: number;
}) {
  return (
    <div className='sticky top-0 z-10 flex items-center justify-between border-b border-subtle bg-base px-4 py-2'>
      <span className='text-sm font-semibold text-primary-token'>{year}</span>
      <span className='text-xs tabular-nums text-tertiary-token'>
        {count}
      </span>
    </div>
  );
}

/**
 * MobileReleaseList - Card/list-based mobile view for releases
 *
 * Inspired by Linear's mobile approach:
 * - Full-width tap targets
 * - Artwork visible (not hidden like in table view)
 * - Vertically stacked info instead of columns
 * - Optional year grouping with sticky headers
 * - No horizontal scrolling
 */
export const MobileReleaseList = memo(function MobileReleaseList({
  releases,
  artistName,
  onEdit,
  groupByYear = false,
}: MobileReleaseListProps) {
  const yearGroups = useMemo(
    () => (groupByYear ? groupReleasesByYear(releases) : null),
    [groupByYear, releases]
  );

  if (yearGroups) {
    return (
      <div className='flex flex-col'>
        {yearGroups.map(group => (
          <div key={group.year}>
            <YearGroupHeader
              year={group.year}
              count={group.releases.length}
            />
            {group.releases.map(release => (
              <MobileReleaseRow
                key={release.id}
                release={release}
                artistName={artistName}
                onEdit={onEdit}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='flex flex-col'>
      {releases.map(release => (
        <MobileReleaseRow
          key={release.id}
          release={release}
          artistName={artistName}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
});
