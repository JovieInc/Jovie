'use client';

import type { CellContext } from '@tanstack/react-table';
import { ArtworkThumb } from '@/components/shell/ArtworkThumb';
import { DropDateChip } from '@/components/shell/DropDateChip';
import { DspAvatarStack } from '@/components/shell/DspAvatarStack';
import { StatusBadge } from '@/components/shell/StatusBadge';
import { TypeBadge } from '@/components/shell/TypeBadge';
import { ExpandButton } from '@/features/dashboard/organisms/release-provider-matrix/components/ExpandButton';
import {
  releaseStatusToShell,
  releaseToDspItems,
} from '@/features/dashboard/organisms/release-provider-matrix/shell-releases/release-adapters';
import {
  PopularityIcon,
  ReleaseCell,
  SmartLinkCell,
} from '@/features/dashboard/organisms/releases/cells';
import {
  formatReleaseDate,
  formatReleaseDateMonthYear,
} from '@/lib/discography/formatting';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { dropDateMeta } from '@/lib/format-drop-date';

export function createReleaseCellRenderer(
  artistName: string | null | undefined,
  onOpen?: (release: ReleaseViewModel) => void,
  designV1 = false
) {
  return function ReleaseCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    if (designV1) {
      return (
        <div className='flex min-w-0 items-center gap-2.5'>
          <ArtworkThumb
            src={row.original.artworkUrl ?? ''}
            title={row.original.title}
            size={34}
          />
          <ReleaseCell
            release={row.original}
            artistName={artistName}
            showType={false}
            onSelect={onOpen}
          />
        </div>
      );
    }

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
  onOpen?: (release: ReleaseViewModel) => void,
  designV1 = false
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
        {designV1 ? (
          <div className='flex min-w-0 flex-1 items-center gap-2.5'>
            <ArtworkThumb
              src={release.artworkUrl ?? ''}
              title={release.title}
              size={34}
            />
            <ReleaseCell
              release={release}
              artistName={artistName}
              showType={false}
              onSelect={onOpen}
            />
          </div>
        ) : (
          <ReleaseCell
            release={release}
            artistName={artistName}
            onSelect={onOpen}
          />
        )}
      </div>
    );
  };
}

export function createRightMetaCellRenderer(
  isSmartLinkLocked?: (releaseId: string) => boolean,
  getSmartLinkLockReason?: (releaseId: string) => 'scheduled' | 'cap' | null,
  designV1 = false
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

    if (designV1) {
      const releaseTypeStyle = release.releaseType
        ? getReleaseTypeStyle(release.releaseType)
        : null;
      const dropMeta = release.releaseDate
        ? dropDateMeta(release.releaseDate)
        : null;

      return (
        <div className='flex min-w-0 items-center justify-end gap-2'>
          <div className='hidden min-w-0 flex-1 justify-end xl:flex'>
            <SmartLinkCell
              release={release}
              locked={isSmartLinkLocked?.(release.id)}
              lockReason={getSmartLinkLockReason?.(release.id)}
            />
          </div>
          <div className='hidden shrink-0 items-center gap-1.5 lg:flex'>
            <StatusBadge status={releaseStatusToShell(release.status)} />
            {releaseTypeStyle ? (
              <TypeBadge label={releaseTypeStyle.label} />
            ) : null}
          </div>
          {dropMeta ? (
            <div className='hidden shrink-0 md:inline-flex'>
              <DropDateChip tone={dropMeta.tone} label={dropMeta.label} />
            </div>
          ) : null}
          <div className='hidden shrink-0 sm:inline-flex'>
            <DspAvatarStack dsps={releaseToDspItems(release)} />
          </div>
          <PopularityIcon popularity={release.spotifyPopularity} />
        </div>
      );
    }

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
