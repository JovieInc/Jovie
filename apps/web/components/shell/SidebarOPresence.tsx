'use client';

import { Button } from '@jovie/ui';
import type { OStrokeProps } from '@jovie/ui/brand/OStroke';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import type { BrandVariant } from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';
import './SidebarOPresence.css';

// The stroke engine loads only when a track is loaded, so idle shells never pay
// for it. Until it arrives the button shows today's glyph, which is the same
// circle (OStroke's rest pose matches it), so nothing shifts or flashes.
const OStroke = dynamic(
  () =>
    import('@jovie/ui/brand/OStroke').then(mod => ({ default: mod.OStroke })),
  {
    loading: () => (
      <BrandLogo
        size='chrome'
        tone='auto'
        variant='jovie'
        rounded
        aria-hidden
      />
    ),
  }
);

type OStrokePose = NonNullable<OStrokeProps['pose']>;

export const SIDEBAR_O_PRESENCE_TEST_ID = 'sidebar-o-presence';
export const SIDEBAR_O_STATUS_TEST_ID = 'sidebar-o-status';
/** A check that ends sooner than this never shows. */
export const SIDEBAR_O_UPDATING_DELAY_MS = 400;
/** Once revealed, the status stays at least this long so it never flickers. */
export const SIDEBAR_O_UPDATING_MIN_MS = 600;

/** The O as the mini player: set while a track is loaded. */
export interface SidebarOPlayer {
  readonly title: string;
  readonly artist?: string | null;
  readonly isPlaying: boolean;
  readonly onToggle: () => void;
  readonly onExpand: () => void;
}

export interface SidebarOPresenceProps {
  /** While audio is loaded the O is the play/pause button, title beside it. */
  readonly player?: SidebarOPlayer;
  /** Another surface (the full player) is the transport: present but inert. */
  readonly inert?: boolean;
  /** True only while the desktop updater is checking or downloading. */
  readonly updating?: boolean;
  /** Main chat page; the O navigates here. No panel, no popover. */
  readonly href?: string;
  readonly variant?: BrandVariant;
}

/**
 * The O: Ovie's presence, docked at the bottom edge of the sidebar. One
 * wrapper owns position so a later slice can morph it into a composer in
 * place. The status slot beside it is always laid out and changes by opacity
 * and transform only, so revealing it never shifts anything.
 */
export function SidebarOPresence({
  player,
  inert = false,
  updating = false,
  href = APP_ROUTES.CHAT,
  variant = 'jovie',
}: SidebarOPresenceProps) {
  const [revealed, setRevealed] = useState(false);
  const revealedAt = useRef(0);

  useEffect(() => {
    if (updating) {
      if (revealed) return;
      const timer = setTimeout(() => {
        revealedAt.current = Date.now();
        setRevealed(true);
      }, SIDEBAR_O_UPDATING_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (!revealed) return;
    const remaining = Math.max(
      0,
      SIDEBAR_O_UPDATING_MIN_MS - (Date.now() - revealedAt.current)
    );
    const timer = setTimeout(() => setRevealed(false), remaining);
    return () => clearTimeout(timer);
  }, [updating, revealed]);

  const buttonClass = cn(
    'relative flex size-7 shrink-0 items-center justify-center rounded-full outline-none',
    'text-primary-token transition-colors duration-fast ease-interactive',
    'hover:bg-sidebar-accent focus-visible:bg-sidebar-accent',
    revealed && 'ring-1 ring-primary/50'
  );
  // Rest pose stays today's glyph. Only a loaded track swaps in the stroke,
  // which opens as the circle and morphs to its play or pause pose.
  const pose: OStrokePose = !player || inert ? 'circle' : playPose(player);
  const [drawnPose, setDrawnPose] = useState<OStrokePose>('circle');
  useEffect(() => setDrawnPose(pose), [pose]);

  return (
    <div
      data-sidebar-o-presence=''
      data-testid={SIDEBAR_O_PRESENCE_TEST_ID}
      data-updating={revealed ? 'true' : undefined}
      data-shell-audio-surface={player ? 'sidebar-compact' : undefined}
      data-state={player ? (inert ? 'reserved' : 'visible') : undefined}
      aria-hidden={inert || undefined}
      inert={inert || undefined}
      // Perspective room: a later slice flips the O into artwork in place.
      style={{ perspective: '600px' }}
      className='flex h-8 shrink-0 items-center gap-2 px-(--app-shell-sidebar-inset) py-1'
    >
      {player ? (
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={`${player.isPlaying ? 'Pause' : 'Play'} ${player.title}`}
          data-sidebar-o-button=''
          onClick={player.onToggle}
          className='shrink-0'
        >
          <OStroke pose={drawnPose} size={20} />
        </Button>
      ) : (
        <Link
          href={href}
          prefetch={false}
          aria-label='Open Chat'
          data-sidebar-o-button=''
          className={buttonClass}
        >
          <BrandLogo
            size='chrome'
            tone='auto'
            variant={variant}
            rounded
            aria-hidden
          />
        </Link>
      )}
      {player ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-audio-expand-player='true'
          onClick={player.onExpand}
          className='min-w-0 flex-1 justify-start'
        >
          <span
            key={player.title}
            className='sidebar-o-title truncate text-2xs text-sidebar-muted'
          >
            {player.artist
              ? `${player.title} · ${player.artist}`
              : player.title}
          </span>
          <span className='sr-only'>Show Player</span>
        </Button>
      ) : (
        <span
          data-testid={SIDEBAR_O_STATUS_TEST_ID}
          data-state={revealed ? 'visible' : 'hidden'}
          className='sidebar-o-status flex h-4 min-w-0 flex-1 items-center gap-1.5 truncate text-2xs text-sidebar-muted'
        >
          {/* The label stays painted while fading out so the slot never reflows. */}
          <span aria-hidden='true' className='flex items-center gap-1.5'>
            <span className='size-1 shrink-0 rounded-full bg-primary' />
            <span className='truncate'>Updating</span>
          </span>
          <span role='status' aria-live='polite' className='sr-only'>
            {revealed ? 'Updating' : ''}
          </span>
        </span>
      )}
    </div>
  );
}

function playPose(player: SidebarOPlayer): OStrokePose {
  return player.isPlaying ? 'pause' : 'triangle';
}
