'use client';

import { ExternalLink, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import {
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useCallback,
  useMemo,
} from 'react';
import { toast } from 'sonner';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { ArtworkPlayOverlay } from '@/components/shell/ArtworkPlayOverlay';
import { ArtworkThumb } from '@/components/shell/ArtworkThumb';
import { DropDateChip } from '@/components/shell/DropDateChip';
import { DspAvatarStack } from '@/components/shell/DspAvatarStack';
import { StatusBadge } from '@/components/shell/StatusBadge';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { dropDateMeta } from '@/lib/format-drop-date';
import { cn } from '@/lib/utils';
import { releaseStatusToShell, releaseToDspItems } from './release-adapters';

/**
 * Linear-style release row for the DESIGN_V1 path. Replaces the legacy
 * provider-matrix cells with: artwork + title + artists + status + drop date
 * + DSP avatar stack + smart link + more menu.
 *
 * The outer `<li>` is the click + keyboard target (parent `<ul role="listbox">`
 * means `<li role="option">` with `tabIndex={0}` is the right semantic).
 * Inner interactive elements (smart link, more-menu) stop propagation so
 * they don't double-fire selection — the standard pattern across shell-v1.
 */
export const ShellReleaseRow = memo(function ShellReleaseRow({
  release,
  isSelected,
  onSelect,
  actionMenuItems,
}: {
  readonly release: ReleaseViewModel;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly actionMenuItems?: TableActionMenuItem[];
}) {
  const dspItems = useMemo(() => releaseToDspItems(release), [release]);
  const dropMeta = useMemo(
    () => (release.releaseDate ? dropDateMeta(release.releaseDate) : null),
    [release.releaseDate]
  );
  const status = releaseStatusToShell(release.status);
  const artistLabel = release.artistNames?.join(', ') ?? '';
  const smartLinkPath = release.smartLinkPath || `/${release.slug}`;

  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const hasPreview = Boolean(release.previewUrl);
  const isActiveTrack = playbackState.activeTrackId === release.id;
  const isPlaying = isActiveTrack && playbackState.isPlaying;
  const primaryArtist = release.artistNames?.[0];

  // Accepts the synthetic event when bound to a real onClick handler so we
  // can stop propagation; safe to invoke without an argument when the
  // host primitive (`ArtworkPlayOverlay`) ignores the event signature.
  const handleTogglePreview = useCallback(
    (e?: MouseEvent<HTMLButtonElement>) => {
      e?.stopPropagation();
      if (!release.previewUrl) return;
      toggleTrack({
        id: release.id,
        title: release.title,
        // Same-track toggles must omit `audioUrl` so the player resumes
        // without re-loading; new-track plays pass the production source.
        audioUrl: isActiveTrack ? undefined : release.previewUrl,
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
      primaryArtist,
      release.artworkUrl,
      release.id,
      release.lyrics,
      release.previewUrl,
      release.primaryIsrc,
      release.title,
      toggleTrack,
    ]
  );

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      role='option'
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      data-shell-release-row
      data-release-id={release.id}
      data-release-active={isActiveTrack ? 'true' : undefined}
      className={cn(
        'group/row relative flex items-center gap-3 px-3 h-14 rounded-md cursor-pointer transition-colors duration-subtle ease-out outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50',
        isSelected
          ? 'bg-(--linear-bg-surface-1)/80'
          : 'hover:bg-(--linear-bg-surface-1)/50'
      )}
    >
      {isSelected ? (
        <span
          aria-hidden='true'
          className='absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[3px] rounded-full bg-cyan-400'
        />
      ) : null}

      <div className='relative h-10 w-10 shrink-0 rounded-sm overflow-hidden'>
        <ArtworkThumb
          src={release.artworkUrl ?? ''}
          title={release.title}
          size={40}
        />
        {hasPreview ? (
          <ArtworkPlayOverlay
            isPlaying={isPlaying}
            onPlay={handleTogglePreview}
            visible={isActiveTrack}
            className='group-hover/row:opacity-100 focus-visible:opacity-100'
          />
        ) : null}
      </div>

      <div className='min-w-0 flex-1'>
        <div className='truncate text-[13px] font-caption text-primary-token leading-[1.2]'>
          {release.title}
        </div>
        <div className='truncate text-[11px] text-tertiary-token leading-[1.3] mt-0.5'>
          {artistLabel}
        </div>
      </div>

      <div className='hidden md:inline-flex shrink-0'>
        <StatusBadge status={status} />
      </div>

      {dropMeta ? (
        <div className='hidden lg:inline-flex shrink-0'>
          <DropDateChip tone={dropMeta.tone} label={dropMeta.label} />
        </div>
      ) : null}

      <div className='hidden md:inline-flex shrink-0'>
        <DspAvatarStack dsps={dspItems} />
      </div>

      <Link
        href={smartLinkPath}
        target='_blank'
        rel='noreferrer'
        onClick={e => e.stopPropagation()}
        title={`Open smart link · ${smartLinkPath}`}
        aria-label={`Open smart link for ${release.title}`}
        className='shrink-0 h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-colors duration-subtle ease-out'
      >
        <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
      </Link>

      {actionMenuItems && actionMenuItems.length > 0 ? (
        <TableActionMenu items={actionMenuItems} trigger='custom' align='end'>
          <button
            type='button'
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            aria-label={`Release actions for ${release.title}`}
            className={cn(
              'shrink-0 h-7 w-7 rounded-md grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-2/70 transition-[opacity,color,background-color] duration-subtle ease-out',
              'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
              isSelected && 'opacity-100'
            )}
          >
            <MoreHorizontal className='h-3 w-3' strokeWidth={2.25} />
          </button>
        </TableActionMenu>
      ) : null}
    </div>
  );
});
