'use client';

import type { CellContext } from '@tanstack/react-table';
import { ExpandButton } from '@/features/dashboard/organisms/release-provider-matrix/components/ExpandButton';
import {
  PopularityIcon,
  ReleaseCell,
  SmartLinkCell,
} from '@/features/dashboard/organisms/releases/cells';
import {
  formatReleaseDate,
  formatReleaseDateMonthYear,
} from '@/lib/discography/formatting';
import type { ReleaseViewModel } from '@/lib/discography/types';

export function createReleaseCellRenderer(
  artistName: string | null | undefined,
  onOpen?: (release: ReleaseViewModel) => void
) {
  return function ReleaseCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return (
      <ReleaseCell
        release={row.original}
        artistName={artistName}
        onSelect={onOpen}
      />
    );
  };
}

export function createExpandableReleaseCellRenderer(
  artistName: string | null | undefined,
  isExpanded: (releaseId: string) => boolean,
  isLoading: (releaseId: string) => boolean,
  onToggleExpansion: (release: ReleaseViewModel) => void,
  onOpen?: (release: ReleaseViewModel) => void
) {
  return function ExpandableReleaseCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    const release = row.original;
    const expanded = isExpanded(release.id);
    const loading = isLoading(release.id);

    return (
      <div className='flex items-center gap-1'>
        <ExpandButton
          isExpanded={expanded}
          isLoading={loading}
          totalTracks={release.totalTracks}
          onClick={e => {
            e.stopPropagation();
            onToggleExpansion(release);
          }}
        />
        <ReleaseCell
          release={release}
          artistName={artistName}
          onSelect={onOpen}
        />
      </div>
    );
  };
}

export function createRightMetaCellRenderer(
  isSmartLinkLocked?: (releaseId: string) => boolean,
  getSmartLinkLockReason?: (releaseId: string) => 'scheduled' | 'cap' | null
) {
  return function RightMetaCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    const release = row.original;
    const dateLabel = release.releaseDate
      ? formatReleaseDateMonthYear(release.releaseDate)
      : '—';
    const yearTitle = release.releaseDate
      ? formatReleaseDate(release.releaseDate)
      : 'Unknown release date';

    return (
      <div className='flex items-center gap-2.5'>
        <div className='max-lg:hidden min-w-0 flex-1'>
          <SmartLinkCell
            release={release}
            locked={isSmartLinkLocked?.(release.id)}
            lockReason={getSmartLinkLockReason?.(release.id)}
          />
        </div>

        <PopularityIcon popularity={release.spotifyPopularity} />

        <span
          className='inline-flex w-[64px] shrink-0 justify-end text-right tabular-nums text-2xs font-normal text-secondary-token'
          title={yearTitle}
        >
          {dateLabel}
        </span>
      </div>
    );
  };
}
