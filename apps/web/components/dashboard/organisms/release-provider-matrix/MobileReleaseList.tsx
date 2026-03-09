'use client';

import { memo, useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  SwipeToReveal,
  SwipeToRevealGroup,
} from '@/components/atoms/SwipeToReveal';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { mobileReleaseTokens } from '@/components/dashboard/tokens';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

type SmartLinkLockReason = 'scheduled' | 'cap' | null;

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
  readonly getSmartLinkLockReason?: (releaseId: string) => SmartLinkLockReason;
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
    const rawYear = release.releaseDate
      ? new Date(release.releaseDate).getFullYear()
      : null;
    const year =
      rawYear !== null && !Number.isNaN(rawYear)
        ? rawYear.toString()
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

function getLockIconName(
  isLocked: boolean,
  lockReason?: SmartLinkLockReason
): string {
  if (!isLocked) return 'Link2';
  return lockReason === 'scheduled' ? 'Clock' : 'Lock';
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
  readonly lockReason?: SmartLinkLockReason;
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
        className={cn(
          mobileReleaseTokens.swipeActions.button,
          mobileReleaseTokens.swipeActions.edit
        )}
        aria-label={`Edit ${release.title}`}
      >
        <Icon name='PencilLine' className='h-4 w-4' aria-hidden='true' />
        <span className={mobileReleaseTokens.swipeActions.label}>Edit</span>
      </button>
      <button
        type='button'
        onClick={handleCopy}
        disabled={isLocked || !onCopy}
        className={cn(
          mobileReleaseTokens.swipeActions.button,
          isLocked
            ? mobileReleaseTokens.swipeActions.locked
            : mobileReleaseTokens.swipeActions.link
        )}
        aria-label={
          isLocked ? lockedAriaLabel : `Copy smart link for ${release.title}`
        }
      >
        <Icon
          name={getLockIconName(isLocked, lockReason)}
          className='h-4 w-4'
          aria-hidden='true'
        />
        <span className={mobileReleaseTokens.swipeActions.label}>
          {isLocked ? lockedLabel : 'Link'}
        </span>
      </button>
    </div>
  );
});

function getReleaseYear(release: ReleaseViewModel): number | null {
  if (!release.releaseDate) return null;
  const year = new Date(release.releaseDate).getFullYear();
  return Number.isNaN(year) ? null : year;
}

/** Single release row in the mobile list — Apple Music layout, Linear tokens */
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
  readonly getSmartLinkLockReason?: (releaseId: string) => SmartLinkLockReason;
}) {
  const year = getReleaseYear(release);

  const typeStyle = getReleaseTypeStyle(release.releaseType);
  const isLocked = isSmartLinkLocked?.(release.id) ?? false;
  const lockReason = getSmartLinkLockReason?.(release.id) ?? null;

  return (
    <SwipeToReveal
      itemId={release.id}
      actionsWidth={SWIPE_ACTIONS_WIDTH}
      actions={
        <SwipeActions
          release={release}
          onEdit={onEdit}
          onCopy={onCopy}
          isLocked={isLocked}
          lockReason={lockReason}
        />
      }
      className='border-b border-subtle'
      contentClassName='bg-base'
    >
      <button
        type='button'
        onClick={() => onEdit(release)}
        className={mobileReleaseTokens.row.container}
      >
        {/* Title + subtitle stacked — artwork hidden on mobile for density */}
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-1.5'>
            <TruncatedText lines={1} className={mobileReleaseTokens.row.title}>
              {release.title}
            </TruncatedText>
            {/* Release type badge */}
            <span
              className={cn(
                mobileReleaseTokens.row.typeBadge,
                typeStyle.text,
                typeStyle.bg
              )}
            >
              {typeStyle.label}
            </span>
          </div>
          <div className={mobileReleaseTokens.row.subtitle}>
            {artistName && <span>{artistName}</span>}
            {artistName && year && (
              <span className={mobileReleaseTokens.row.dot}>{' \u00B7 '}</span>
            )}
            {year && <span className='tabular-nums'>{year}</span>}
          </div>
        </div>

        {/* Chevron indicator */}
        <Icon
          name='ChevronRight'
          className={mobileReleaseTokens.row.chevron}
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
    <div className={mobileReleaseTokens.groupHeader}>
      <span className={mobileReleaseTokens.groupHeaderTitle}>{year}</span>
      <span className={mobileReleaseTokens.groupHeaderCount}>{count}</span>
    </div>
  );
}

/**
 * MobileReleaseList - Compact list view inspired by Apple Music layout
 * with Linear design tokens.
 *
 * Features:
 * - Full-width tap targets
 * - Artwork hidden for density; title + artist + year inline
 * - Release type shown as a colored pill badge
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
            getSmartLinkLockReason={getSmartLinkLockReason}
          />
        ))}
      </div>
    </SwipeToRevealGroup>
  );
});
