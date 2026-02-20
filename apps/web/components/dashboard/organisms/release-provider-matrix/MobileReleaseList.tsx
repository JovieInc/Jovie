'use client';

import { memo, useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ReleaseArtworkThumb } from '@/components/atoms/ReleaseArtworkThumb';
import {
  SwipeToReveal,
  SwipeToRevealGroup,
} from '@/components/atoms/SwipeToReveal';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

interface MobileReleaseListProps {
  readonly releases: ReleaseViewModel[];
  readonly artistName?: string | null;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly onCopy?: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly isSmartLinkLocked?: (releaseId: string) => boolean;
  readonly getSmartLinkLockReason?: (
    releaseId: string
  ) => 'scheduled' | 'cap' | null;
  readonly groupByYear?: boolean;
}

interface YearGroup {
  year: string;
  releases: ReleaseViewModel[];
}

/** Width of the revealed swipe action buttons (px) */
const SWIPE_ACTIONS_WIDTH = 128;

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

/** Swipe action buttons revealed on left-swipe */
const SwipeActions = memo(function SwipeActions({
  release,
  onEdit,
  onCopy,
  isLocked,
  lockReason,
}: {
  readonly release: ReleaseViewModel;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly onCopy?: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly isLocked: boolean;
  readonly lockReason?: 'scheduled' | 'cap' | null;
}) {
  const handleCopy = useCallback(() => {
    if (onCopy && !isLocked) {
      void onCopy(
        release.smartLinkPath,
        `${release.title} smart link`,
        `smart-link-copy-${release.id}`
      );
    }
  }, [onCopy, isLocked, release]);

  const lockedLabel = lockReason === 'scheduled' ? 'Scheduled' : 'Pro';
  const lockedAriaLabel =
    lockReason === 'scheduled'
      ? 'Smart link scheduled — goes live on release day'
      : 'Smart link locked (Pro)';

  return (
    <div className='flex h-full items-stretch'>
      <button
        type='button'
        onClick={() => onEdit(release)}
        className='flex w-16 flex-col items-center justify-center gap-1 bg-indigo-500 text-white active:bg-indigo-600'
        aria-label={`Edit ${release.title}`}
      >
        <Icon name='PencilLine' className='h-4 w-4' aria-hidden='true' />
        <span className='text-[10px] font-medium'>Edit</span>
      </button>
      <button
        type='button'
        onClick={handleCopy}
        disabled={isLocked || !onCopy}
        className={cn(
          'flex w-16 flex-col items-center justify-center gap-1 text-white active:opacity-80',
          isLocked
            ? 'bg-neutral-400 opacity-60'
            : 'bg-sky-500 active:bg-sky-600'
        )}
        aria-label={
          isLocked ? lockedAriaLabel : `Copy smart link for ${release.title}`
        }
      >
        <Icon
          name={
            isLocked ? (lockReason === 'scheduled' ? 'Clock' : 'Lock') : 'Link2'
          }
          className='h-4 w-4'
          aria-hidden='true'
        />
        <span className='text-[10px] font-medium'>
          {isLocked ? lockedLabel : 'Link'}
        </span>
      </button>
    </div>
  );
});

/** Single release row in the mobile list */
const MobileReleaseRow = memo(function MobileReleaseRow({
  release,
  artistName,
  onEdit,
  onCopy,
  isSmartLinkLocked,
  getSmartLinkLockReason,
}: {
  readonly release: ReleaseViewModel;
  readonly artistName?: string | null;
  readonly onEdit: (release: ReleaseViewModel) => void;
  readonly onCopy?: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly isSmartLinkLocked?: (releaseId: string) => boolean;
  readonly getSmartLinkLockReason?: (
    releaseId: string
  ) => 'scheduled' | 'cap' | null;
}) {
  const year = release.releaseDate
    ? new Date(release.releaseDate).getFullYear()
    : null;

  const typeStyle = getReleaseTypeStyle(release.releaseType);
  const isLocked = isSmartLinkLocked?.(release.id) ?? false;
  const lockReason = getSmartLinkLockReason?.(release.id) ?? null;

  const actions = useMemo(
    () => (
      <SwipeActions
        release={release}
        onEdit={onEdit}
        onCopy={onCopy}
        isLocked={isLocked}
        lockReason={lockReason}
      />
    ),
    [release, onEdit, onCopy, isLocked, lockReason]
  );

  return (
    <SwipeToReveal
      itemId={release.id}
      actionsWidth={SWIPE_ACTIONS_WIDTH}
      actions={actions}
      className='border-b border-subtle'
      contentClassName='bg-base'
    >
      <button
        type='button'
        onClick={() => onEdit(release)}
        className='flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2/50 focus-visible:outline-none focus-visible:bg-surface-2/50'
      >
        {/* Artwork thumbnail */}
        <ReleaseArtworkThumb
          src={release.artworkUrl}
          alt={`${release.title} artwork`}
        />

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
    </SwipeToReveal>
  );
});

/** Year group header */
function YearGroupHeader({
  year,
  count,
}: Readonly<{ year: string; count: number }>) {
  return (
    <div className='sticky top-0 z-10 flex items-center justify-between border-b border-subtle bg-base px-4 py-2'>
      <span className='text-sm font-semibold text-primary-token'>{year}</span>
      <span className='text-xs tabular-nums text-tertiary-token'>{count}</span>
    </div>
  );
}

/**
 * MobileReleaseList - Card/list-based mobile view for releases
 *
 * Features:
 * - Full-width tap targets
 * - Artwork visible (not hidden like in table view)
 * - Vertically stacked info instead of columns
 * - Optional year grouping with sticky headers
 * - iOS-style swipe-to-reveal actions (Edit, Copy smart link)
 * - No horizontal scrolling
 */
export const MobileReleaseList = memo(function MobileReleaseList({
  releases,
  artistName,
  onEdit,
  onCopy,
  isSmartLinkLocked,
  getSmartLinkLockReason,
  groupByYear = false,
}: MobileReleaseListProps) {
  const yearGroups = useMemo(
    () => (groupByYear ? groupReleasesByYear(releases) : null),
    [groupByYear, releases]
  );

  if (yearGroups) {
    return (
      <SwipeToRevealGroup>
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
                  onCopy={onCopy}
                  isSmartLinkLocked={isSmartLinkLocked}
                  getSmartLinkLockReason={getSmartLinkLockReason}
                />
              ))}
            </div>
          ))}
        </div>
      </SwipeToRevealGroup>
    );
  }

  return (
    <SwipeToRevealGroup>
      <div className='flex flex-col'>
        {releases.map(release => (
          <MobileReleaseRow
            key={release.id}
            release={release}
            artistName={artistName}
            onEdit={onEdit}
            onCopy={onCopy}
            isSmartLinkLocked={isSmartLinkLocked}
          />
        ))}
      </div>
    </SwipeToRevealGroup>
  );
});
