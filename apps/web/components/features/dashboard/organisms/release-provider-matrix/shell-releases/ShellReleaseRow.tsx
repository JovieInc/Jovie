'use client';

import {
  Clock,
  ExternalLink,
  Lock,
  MoreHorizontal,
  Pause,
  Play,
} from 'lucide-react';
import Link from 'next/link';
import {
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useCallback,
  useMemo,
} from 'react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import { toast } from '@/components/feedback';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { ShellListRowFrame } from '@/components/organisms/table';
import { AgentPulse } from '@/components/shell/AgentPulse';
import { ArtworkThumb } from '@/components/shell/ArtworkThumb';
import { DropDateChip } from '@/components/shell/DropDateChip';
import { DspAvatarStack } from '@/components/shell/DspAvatarStack';
import {
  EntityHoverLink,
  type EntityPopoverData,
} from '@/components/shell/EntityPopover';
import { StatusBadge } from '@/components/shell/StatusBadge';
import { TypeBadge } from '@/components/shell/TypeBadge';
import type { ReleaseType, ReleaseViewModel } from '@/lib/discography/types';
import { dropDateMeta } from '@/lib/format-drop-date';
import { cn } from '@/lib/utils';
import { releaseStatusToShell, releaseToDspItems } from './release-adapters';

export type ShellRowLockReason = 'scheduled' | 'cap' | null;

/**
 * In-flight agent state for a release row, mirroring the experiment's
 * inline "Syncing artwork…" affordance. Driven by real production signals
 * (the parent's `refreshingReleaseId` / ISRC rescan), not mock data.
 */
export type ShellReleaseSyncStatus = 'refreshing' | 'rescanning-isrc' | null;

const SHELL_RELEASE_SYNC_LABEL: Record<
  NonNullable<ShellReleaseSyncStatus>,
  string
> = {
  refreshing: 'Syncing…',
  'rescanning-isrc': 'Rescanning ISRC…',
};

/**
 * Short, capitalized release-type label for the inline `TypeBadge`. Mirrors
 * the canonical labels used in the release filter/add surfaces so the row
 * agrees with the rest of the releases experience.
 */
const RELEASE_TYPE_BADGE_LABEL: Record<ReleaseType, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  compilation: 'Comp',
  live: 'Live',
  mixtape: 'Mixtape',
  music_video: 'Video',
  other: 'Other',
};
export const shellReleaseRowTypography = {
  title: 'truncate text-app font-caption text-primary-token leading-[1.2]',
  subtitle: 'truncate text-2xs text-tertiary-token leading-[1.3]',
} as const;

// ── Subcomponents ─────────────────────────────────────────────────────────────

function useArtworkPlayback(release: ReleaseViewModel) {
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const previewUrl = release.previewUrl ?? null;
  const isActiveTrack = playbackState.activeTrackId === release.id;
  const isTrackPlaying = isActiveTrack && playbackState.isPlaying;
  const primaryArtist = release.artistNames?.[0];

  const handleTogglePlayback = useCallback(
    (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
      e.stopPropagation();

      if (isActiveTrack) {
        toggleTrack({ id: release.id, title: release.title }).catch(() => {
          toast.error('Unable to control playback right now');
        });
        return;
      }

      if (!previewUrl) return;

      toggleTrack({
        id: release.id,
        title: release.title,
        audioUrl: previewUrl,
        isrc: release.primaryIsrc ?? null,
        releaseTitle: release.title,
        artistName: primaryArtist,
        artworkUrl: release.artworkUrl,
        hasLyrics: Boolean(release.lyrics?.trim()),
      }).catch(() => {
        toast.error('Unable to play preview');
      });
    },
    [
      isActiveTrack,
      previewUrl,
      primaryArtist,
      release.artworkUrl,
      release.id,
      release.lyrics,
      release.primaryIsrc,
      release.title,
      toggleTrack,
    ]
  );

  return { previewUrl, isActiveTrack, isTrackPlaying, handleTogglePlayback };
}

const ArtworkCell = memo(function ArtworkCell({
  release,
  isSyncing,
}: {
  readonly release: ReleaseViewModel;
  readonly isSyncing: boolean;
}) {
  const { previewUrl, isTrackPlaying, handleTogglePlayback } =
    useArtworkPlayback(release);
  const hasPreview = Boolean(previewUrl);

  return (
    <div className='relative shrink-0'>
      <ArtworkThumb
        src={release.artworkUrl ?? ''}
        title={release.title}
        size={40}
      />
      {isSyncing ? <AgentPulse className='rounded-sm' /> : null}
      {hasPreview ? (
        <button
          type='button'
          onClick={handleTogglePlayback}
          onKeyDown={e => e.stopPropagation()}
          aria-label={
            isTrackPlaying ? `Pause ${release.title}` : `Play ${release.title}`
          }
          aria-pressed={isTrackPlaying}
          data-testid={`shell-release-play-${release.id}`}
          className={cn(
            // Always renders white-on-black scrim in both themes — pair the
            // light/dark utilities so the play glyph stays legible on the
            // `bg-black/50` overlay (satisfies no-hardcoded-theme-colors).
            'absolute inset-0 grid place-items-center rounded-sm bg-black/50 text-white dark:text-white transition-opacity duration-subtle ease-subtle focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55',
            isTrackPlaying
              ? 'opacity-100'
              : 'opacity-0 group-hover/row:opacity-100'
          )}
        >
          {isTrackPlaying ? (
            <Pause
              className='h-3.5 w-3.5'
              strokeWidth={2.5}
              fill='currentColor'
              aria-hidden='true'
            />
          ) : (
            <Play
              className='h-3.5 w-3.5 translate-x-px'
              strokeWidth={2.5}
              fill='currentColor'
              aria-hidden='true'
            />
          )}
        </button>
      ) : null}
    </div>
  );
});

const SmartLinkCell = memo(function SmartLinkCell({
  release,
  smartLinkLockReason,
  smartLinkPath,
}: {
  readonly release: ReleaseViewModel;
  readonly smartLinkLockReason: ShellRowLockReason;
  readonly smartLinkPath: string;
}) {
  const isLocked = smartLinkLockReason !== null;
  const isScheduled = smartLinkLockReason === 'scheduled';

  if (isLocked) {
    return (
      <span
        role='img'
        aria-label={
          isScheduled
            ? `Scheduled smart link (Pro) for ${release.title}`
            : `Smart link locked (Pro) for ${release.title}`
        }
        title={
          isScheduled
            ? 'Pre-release smart link requires Pro'
            : 'Smart link locked — upgrade for more'
        }
        data-shell-release-smart-link-locked='true'
        data-shell-release-smart-link-lock-reason={smartLinkLockReason}
        className='shrink-0 h-7 w-7 rounded-md grid place-items-center text-quaternary-token cursor-not-allowed'
      >
        {isScheduled ? (
          <Clock className='h-3 w-3' strokeWidth={2.25} aria-hidden='true' />
        ) : (
          <Lock className='h-3 w-3' strokeWidth={2.25} aria-hidden='true' />
        )}
      </span>
    );
  }

  return (
    <Link
      href={smartLinkPath}
      target='_blank'
      rel='noreferrer'
      onClick={e => e.stopPropagation()}
      title={`Open smart link · ${smartLinkPath}`}
      aria-label={`Open smart link for ${release.title}`}
      className='shrink-0 h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-colors duration-subtle ease-subtle'
    >
      <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
    </Link>
  );
});

// ── Main row component ─────────────────────────────────────────────────────────

/**
 * Linear-style release row for the DESIGN_V1 path. Replaces the legacy
 * provider-matrix cells with: artwork (+ agent pulse when syncing) + title
 * + type badge + artists (+ inline sync status) + status + drop date +
 * DSP avatar stack + smart link + more menu.
 *
 * The outer `<div>` is the click + keyboard target (parent `<div role="listbox">`)
 * Inner interactive elements (smart link, more-menu) stop propagation so
 * they don't double-fire selection — the standard pattern across shell-v1.
 */
export const ShellReleaseRow = memo(function ShellReleaseRow({
  release,
  isSelected,
  onSelect,
  actionMenuItems,
  smartLinkLockReason = null,
  syncStatus = null,
}: {
  readonly release: ReleaseViewModel;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly actionMenuItems?: TableActionMenuItem[];
  readonly smartLinkLockReason?: ShellRowLockReason;
  /**
   * In-flight agent state for this release (refresh / ISRC rescan). When set,
   * the artwork shows an `AgentPulse` and the artist line appends a status
   * label. Degrades to nothing when `null` (the common idle case).
   */
  readonly syncStatus?: ShellReleaseSyncStatus;
}) {
  const dspItems = useMemo(() => releaseToDspItems(release), [release]);
  const dropMeta = useMemo(
    () => (release.releaseDate ? dropDateMeta(release.releaseDate) : null),
    [release.releaseDate]
  );
  const status = releaseStatusToShell(release.status);
  const artistLabel = release.artistNames?.join(', ') ?? '';
  const typeLabel = RELEASE_TYPE_BADGE_LABEL[release.releaseType] ?? 'Single';
  const syncLabel = syncStatus ? SHELL_RELEASE_SYNC_LABEL[syncStatus] : null;
  const smartLinkPath = release.smartLinkPath || `/${release.slug}`;
  const { playbackState } = useTrackAudioPlayer();
  const isActiveTrack = playbackState.activeTrackId === release.id;

  const releaseEntity: EntityPopoverData = {
    kind: 'release',
    id: release.id,
    label: release.title,
    thumbnail: release.artworkUrl,
    artist: artistLabel || undefined,
    releaseType: release.releaseType,
    releaseDate: release.releaseDate,
    totalTracks: release.totalTracks > 0 ? release.totalTracks : undefined,
    durationSec: release.totalDurationMs
      ? Math.floor(release.totalDurationMs / 1000)
      : undefined,
    status: release.status,
  };

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <ShellListRowFrame
      role='option'
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      data-shell-release-row
      data-release-id={release.id}
      data-release-active={isActiveTrack ? 'true' : undefined}
      isSelected={isSelected}
      interactive
      className='group/row flex h-14 items-center gap-3 px-3'
    >
      <ArtworkCell release={release} isSyncing={syncLabel !== null} />

      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-1.5'>
          <EntityHoverLink
            entity={releaseEntity}
            className={cn(
              shellReleaseRowTypography.title,
              'inline-flex min-w-0 hover:no-underline'
            )}
          >
            {release.title}
          </EntityHoverLink>
          <TypeBadge label={typeLabel} />
        </div>
        <div className='mt-0.5 flex min-w-0 items-center'>
          <span className={shellReleaseRowTypography.subtitle}>
            {artistLabel}
          </span>
          {syncLabel ? (
            <span className='ml-1 inline-flex shrink-0 items-center text-2xs text-accent-blue'>
              <span aria-hidden='true' className='mr-1 text-quaternary-token'>
                ·
              </span>
              <span className='whitespace-nowrap'>{syncLabel}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className='hidden w-24 shrink-0 justify-start md:inline-flex'>
        <StatusBadge status={status} />
      </div>

      {dropMeta ? (
        <div className='hidden w-28 shrink-0 justify-start lg:inline-flex'>
          <DropDateChip tone={dropMeta.tone} label={dropMeta.label} />
        </div>
      ) : (
        <span className='hidden w-28 shrink-0 lg:block' aria-hidden='true' />
      )}

      <div className='hidden w-24 shrink-0 justify-start md:inline-flex'>
        <DspAvatarStack dsps={dspItems} maxVisible={3} />
      </div>

      <SmartLinkCell
        release={release}
        smartLinkLockReason={smartLinkLockReason}
        smartLinkPath={smartLinkPath}
      />

      {actionMenuItems && actionMenuItems.length > 0 ? (
        <div
          className='h-7 w-7 shrink-0'
          data-testid='shell-release-row-actions'
        >
          <TableActionMenu items={actionMenuItems} trigger='custom' align='end'>
            <button
              type='button'
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              aria-label={`Release actions for ${release.title}`}
              className={cn(
                'shrink-0 h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-[opacity,color,background-color] duration-subtle ease-subtle',
                'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
                isSelected && 'opacity-100'
              )}
            >
              <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
            </button>
          </TableActionMenu>
        </div>
      ) : null}
    </ShellListRowFrame>
  );
});
