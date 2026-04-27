'use client';

// EntityPopover — hover-revealed entity preview anchored to a dropdown row
// (or any other DOM element). Used by ShellDropdown.EntityItem; also exported
// so the release drawer + chat @-mentions can reuse the same vocabulary.
//
// Positioning is computed manually from the anchor's bounding rect — keeps
// the surface tightly anchored to the row without dragging in @floating-ui's
// hooks. Side defaults to 'right' and flips to 'left' on collision.
//
// Visual chrome matches ShellDropdown so they read as one system.
//
// Touch / coarse pointer is suppressed at the ShellDropdown level — this
// component just renders what it's given.

import Image from 'next/image';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export type EntityPopoverData =
  | {
      readonly kind: 'release';
      readonly id: string;
      readonly label: string;
      readonly thumbnail?: string;
      readonly artist?: string;
      readonly releaseType?: string;
      readonly releaseDate?: string; // ISO
      readonly totalTracks?: number;
      readonly durationSec?: number;
      readonly status?: string;
    }
  | {
      readonly kind: 'artist';
      readonly id: string;
      readonly label: string;
      readonly thumbnail?: string;
      readonly handle?: string;
      readonly followers?: number;
      readonly verified?: boolean;
      readonly isYou?: boolean;
      readonly popularity?: number;
    }
  | {
      readonly kind: 'track';
      readonly id: string;
      readonly label: string;
      readonly thumbnail?: string;
      readonly artist?: string;
      readonly releaseTitle?: string;
      readonly durationSec?: number;
      readonly bpm?: number;
      readonly keyName?: string;
    }
  | {
      readonly kind: 'event';
      readonly id: string;
      readonly label: string;
      readonly thumbnail?: string;
      readonly eventDate?: string;
      readonly city?: string;
      readonly capacity?: number;
      readonly status?: string;
      readonly eventType?: 'tour' | 'meetup' | 'guest' | 'charity' | 'other';
    }
  | {
      readonly kind: 'contact';
      readonly id: string;
      readonly label: string;
      readonly thumbnail?: string;
      readonly handle?: string;
      readonly role?: string;
      readonly status?: string;
    }
  | {
      readonly kind: 'teammate';
      readonly id: string;
      readonly label: string;
      readonly thumbnail?: string;
      readonly handle?: string;
      readonly role?: string;
      readonly status?: 'active' | 'idle' | 'away' | 'offline';
      readonly email?: string;
    };

// ---------------------------------------------------------------------------
// Subtitle formatter — used by ShellDropdown.EntityItem when no override
// secondaryText is given.
// ---------------------------------------------------------------------------

export function formatEntitySubtitle(entity: EntityPopoverData): string | null {
  switch (entity.kind) {
    case 'release': {
      const parts: string[] = [];
      if (entity.releaseType) parts.push(entity.releaseType);
      if (entity.artist) parts.push(entity.artist);
      return parts.join(' · ') || null;
    }
    case 'artist': {
      if (entity.handle)
        return `@${entity.handle}${entity.isYou ? ' · You' : ''}`;
      if (entity.followers)
        return `${compactNumber(entity.followers)} followers`;
      return entity.isYou ? 'You' : 'Artist';
    }
    case 'track': {
      if (entity.artist && entity.releaseTitle)
        return `${entity.artist} · ${entity.releaseTitle}`;
      return entity.artist ?? entity.releaseTitle ?? null;
    }
    case 'event': {
      const parts: string[] = [];
      if (entity.city) parts.push(entity.city);
      if (entity.eventDate) {
        const d = new Date(entity.eventDate);
        if (!Number.isNaN(d.getTime())) {
          parts.push(
            d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
          );
        }
      }
      return parts.join(' · ') || null;
    }
    case 'contact':
    case 'teammate': {
      if (entity.role && entity.handle)
        return `${entity.role} · @${entity.handle}`;
      if (entity.role) return entity.role;
      if (entity.handle) return `@${entity.handle}`;
      return null;
    }
  }
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function formatLongDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatClock(durationSec: number | undefined): string | null {
  if (typeof durationSec !== 'number' || durationSec <= 0) return null;
  const m = Math.floor(durationSec / 60);
  const s = Math.floor(durationSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function initialsOf(label: string): string {
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p.charAt(0))
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Row art — small 28×28 leading element rendered inside ShellDropdown.EntityItem.
// ---------------------------------------------------------------------------

export function EntityRowArt({
  entity,
}: {
  readonly entity: EntityPopoverData;
}) {
  if (entity.kind === 'event' && !entity.thumbnail) {
    const stamp = stampParts(entity.eventDate);
    if (stamp) {
      return (
        <span className='flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-md bg-gradient-to-b from-[#1a1a1f] to-[#0a0a0c] shadow-[inset_0_0.5px_0_rgba(255,255,255,0.08),inset_0_0_0_0.5px_rgba(255,255,255,0.04)]'>
          <span className='text-[7px] font-semibold uppercase tracking-[0.1em] text-tertiary-token leading-none'>
            {stamp.month}
          </span>
          <span className='text-[12px] font-bold leading-none tracking-[-0.02em] text-primary-token mt-0.5'>
            {stamp.day}
          </span>
        </span>
      );
    }
  }
  if (entity.thumbnail) {
    const rounded =
      entity.kind === 'artist' ||
      entity.kind === 'contact' ||
      entity.kind === 'teammate'
        ? 'rounded-full'
        : 'rounded-md';
    return (
      <span
        className={cn(
          'relative h-7 w-7 shrink-0 overflow-hidden shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.06)]',
          rounded
        )}
      >
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='28px'
          className='object-cover'
          unoptimized
        />
      </span>
    );
  }
  const isCircular =
    entity.kind === 'artist' ||
    entity.kind === 'contact' ||
    entity.kind === 'teammate';
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-semibold tracking-[-0.01em] text-primary-token',
        'bg-gradient-to-br from-[#2a2a2f] to-[#16161a]',
        'shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.06)]',
        isCircular ? 'rounded-full' : 'rounded-md'
      )}
    >
      {initialsOf(entity.label) || '·'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card body — variant per kind. Renders inside the popover surface.
// ---------------------------------------------------------------------------

interface StatChip {
  readonly key: string;
  readonly node: React.ReactNode;
  readonly emphasis?: 'solid';
}

function buildStats(entity: EntityPopoverData): StatChip[] {
  const out: StatChip[] = [];
  switch (entity.kind) {
    case 'release': {
      if (typeof entity.totalTracks === 'number' && entity.totalTracks > 0) {
        out.push({
          key: 'tracks',
          node: (
            <>
              <strong className='font-semibold tabular-nums text-primary-token'>
                {entity.totalTracks}
              </strong>{' '}
              tracks
            </>
          ),
        });
      }
      const longDate = formatLongDate(entity.releaseDate);
      if (longDate) out.push({ key: 'date', node: longDate });
      const clock = formatClock(entity.durationSec);
      if (clock) out.push({ key: 'duration', node: clock });
      if (entity.status)
        out.push({ key: 'status', node: entity.status, emphasis: 'solid' });
      break;
    }
    case 'artist': {
      if (entity.handle) out.push({ key: 'handle', node: `@${entity.handle}` });
      if (entity.followers) {
        out.push({
          key: 'followers',
          node: (
            <>
              <strong className='font-semibold tabular-nums text-primary-token'>
                {compactNumber(entity.followers)}
              </strong>{' '}
              followers
            </>
          ),
        });
      }
      if (typeof entity.popularity === 'number' && entity.popularity > 0) {
        out.push({
          key: 'pop',
          node: (
            <>
              Spotify{' '}
              <strong className='font-semibold tabular-nums text-primary-token'>
                {entity.popularity}
              </strong>
            </>
          ),
        });
      }
      if (entity.verified)
        out.push({ key: 'verified', node: 'Verified', emphasis: 'solid' });
      if (entity.isYou)
        out.push({ key: 'you', node: 'You', emphasis: 'solid' });
      break;
    }
    case 'track': {
      if (entity.bpm) {
        out.push({
          key: 'bpm',
          node: (
            <>
              <strong className='font-semibold tabular-nums text-primary-token'>
                {entity.bpm}
              </strong>{' '}
              BPM
            </>
          ),
        });
      }
      if (entity.keyName) out.push({ key: 'key', node: entity.keyName });
      const clock = formatClock(entity.durationSec);
      if (clock) out.push({ key: 'duration', node: clock });
      if (entity.releaseTitle)
        out.push({ key: 'release', node: entity.releaseTitle });
      break;
    }
    case 'event': {
      if (entity.city) out.push({ key: 'city', node: entity.city });
      const longDate = formatLongDate(entity.eventDate);
      if (longDate) out.push({ key: 'date', node: longDate });
      if (typeof entity.capacity === 'number' && entity.capacity > 0) {
        out.push({
          key: 'cap',
          node: (
            <>
              <strong className='font-semibold tabular-nums text-primary-token'>
                {entity.capacity.toLocaleString()}
              </strong>{' '}
              cap
            </>
          ),
        });
      }
      if (entity.status)
        out.push({ key: 'status', node: entity.status, emphasis: 'solid' });
      if (entity.eventType)
        out.push({ key: 'type', node: capitalize(entity.eventType) });
      break;
    }
    case 'contact':
    case 'teammate': {
      if (entity.handle) out.push({ key: 'handle', node: `@${entity.handle}` });
      if (entity.kind === 'teammate' && entity.email) {
        out.push({ key: 'email', node: entity.email });
      }
      if (entity.kind === 'teammate' && entity.status) {
        out.push({
          key: 'status',
          node: capitalize(entity.status),
          emphasis: 'solid',
        });
      }
      break;
    }
  }
  return out;
}

function eyebrowOf(entity: EntityPopoverData): string {
  switch (entity.kind) {
    case 'release':
      return entity.releaseType ? `Release · ${entity.releaseType}` : 'Release';
    case 'artist':
      if (entity.isYou) return 'Artist · You';
      if (entity.verified) return 'Artist · Verified';
      return 'Artist';
    case 'track':
      return entity.releaseTitle ? `Track · ${entity.releaseTitle}` : 'Track';
    case 'event':
      return entity.eventType
        ? `Event · ${capitalize(entity.eventType)}`
        : 'Event';
    case 'contact':
      return 'Contact';
    case 'teammate':
      return entity.role ? `Teammate · ${entity.role}` : 'Teammate';
  }
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

interface DateStampParts {
  readonly month: string;
  readonly day: string;
}

function stampParts(iso: string | undefined): DateStampParts | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate().toString(),
  };
}

// 56×56 hero artwork inside the card.
function CardArtwork({ entity }: { readonly entity: EntityPopoverData }) {
  if (entity.kind === 'event' && !entity.thumbnail) {
    const stamp = stampParts(entity.eventDate);
    if (stamp) {
      return (
        <div
          className='flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[8px] shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.08),0_8px_18px_-8px_rgba(0,0,0,0.55)]'
          style={{ background: 'linear-gradient(180deg,#1a1a1f,#0a0a0c)' }}
        >
          <span className='text-[8px] font-semibold uppercase tracking-[0.12em] text-tertiary-token'>
            {stamp.month}
          </span>
          <span className='text-[20px] font-bold leading-none tracking-[-0.02em] text-primary-token'>
            {stamp.day}
          </span>
        </div>
      );
    }
  }
  const isCircular =
    entity.kind === 'artist' ||
    entity.kind === 'contact' ||
    entity.kind === 'teammate';
  if (entity.thumbnail) {
    return (
      <div
        className={cn(
          'relative h-14 w-14 shrink-0 overflow-hidden shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.08),0_8px_18px_-8px_rgba(0,0,0,0.55)]',
          isCircular ? 'rounded-full' : 'rounded-[8px]'
        )}
      >
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='56px'
          className='object-cover'
          unoptimized
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex h-14 w-14 shrink-0 items-center justify-center text-[16px] font-semibold tracking-[-0.02em] text-primary-token',
        'bg-gradient-to-br from-[#2a2a2f] to-[#16161a]',
        'shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.08),0_8px_18px_-8px_rgba(0,0,0,0.55)]',
        isCircular ? 'rounded-full' : 'rounded-[8px]'
      )}
    >
      {initialsOf(entity.label) || '·'}
    </div>
  );
}

interface EntityCardProps {
  readonly entity: EntityPopoverData;
  readonly onActivate?: (entity: EntityPopoverData) => void;
}

function EntityCard({ entity, onActivate }: EntityCardProps) {
  const stats = buildStats(entity);
  const eyebrow = eyebrowOf(entity);

  // Internal links — currently for release.artist and track.artist.
  const artistLink =
    (entity.kind === 'release' || entity.kind === 'track') && entity.artist
      ? entity.artist
      : null;

  return (
    <div className='flex items-start gap-3'>
      <CardArtwork entity={entity} />
      <div className='min-w-0 flex-1 pt-0.5'>
        <div className='mb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-quaternary-token'>
          {eyebrow}
        </div>
        <h3 className='m-0 mb-2 text-[15px] font-semibold leading-[1.2] tracking-[-0.02em] text-primary-token truncate'>
          {entity.label}
        </h3>
        {artistLink ? (
          <button
            type='button'
            onClick={() => {
              // Synthesize a minimal artist entity to surface the linked entity.
              onActivate?.({
                kind: 'artist',
                id: `artist:${artistLink}`,
                label: artistLink,
              });
            }}
            className='mb-2 inline-flex items-center text-[11.5px] text-tertiary-token hover:text-primary-token underline underline-offset-2 decoration-(--linear-app-shell-border) hover:decoration-current transition-colors duration-150 ease-out'
          >
            {artistLink}
          </button>
        ) : null}
        {stats.length > 0 ? (
          <div className='flex flex-wrap items-center text-[11.5px] leading-[1.5] tracking-[-0.002em] text-tertiary-token'>
            {stats.map((stat, i) => (
              <span
                key={stat.key}
                className={cn(
                  'relative inline-flex items-center whitespace-nowrap',
                  stat.emphasis === 'solid'
                    ? 'ml-2 rounded-[3px] bg-white/10 px-[6px] py-px text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary-token'
                    : 'px-[8px]',
                  i === 0 && stat.emphasis !== 'solid' && 'pl-0',
                  i > 0 &&
                    stat.emphasis !== 'solid' &&
                    "before:absolute before:left-0 before:top-1/2 before:h-[2px] before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-quaternary-token before:content-['']"
                )}
              >
                {stat.node}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popover surface — fixed-positioned, anchored to a row, collision-flips.
// ---------------------------------------------------------------------------

interface EntityPopoverProps {
  readonly entity: EntityPopoverData;
  readonly anchor: HTMLElement;
  readonly onPointerEnter?: () => void;
  readonly onPointerLeave?: () => void;
  readonly onActivate?: (entity: EntityPopoverData) => void;
}

const POPOVER_WIDTH = 288;
const POPOVER_MARGIN = 8;
const SIDE_OFFSET = 6;

interface PopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly side: 'left' | 'right';
}

export function EntityPopover({
  entity,
  anchor,
  onPointerEnter,
  onPointerLeave,
  onActivate,
}: EntityPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  // Mount-detect for SSR-safe portal.
  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const a = anchor.getBoundingClientRect();
      const contentHeight = popoverRef.current?.offsetHeight ?? 96;
      const wantsRight =
        a.right + SIDE_OFFSET + POPOVER_WIDTH <=
        window.innerWidth - POPOVER_MARGIN;
      const left = wantsRight
        ? a.right + SIDE_OFFSET
        : Math.max(POPOVER_MARGIN, a.left - SIDE_OFFSET - POPOVER_WIDTH);
      let top = a.top;
      if (top + contentHeight > window.innerHeight - POPOVER_MARGIN) {
        top = window.innerHeight - POPOVER_MARGIN - contentHeight;
      }
      if (top < POPOVER_MARGIN) top = POPOVER_MARGIN;
      setPos({ left, top, side: wantsRight ? 'right' : 'left' });
    };
    update();
    // Re-measure once the element is in the DOM with a real height.
    const raf = requestAnimationFrame(update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role='tooltip'
      data-side={pos?.side ?? 'right'}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: POPOVER_WIDTH,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={cn(
        'z-[80]',
        'rounded-xl border border-(--linear-app-shell-border)',
        'bg-(--linear-app-content-surface)/95 backdrop-blur-xl',
        'shadow-[0_12px_40px_rgba(0,0,0,0.32)] p-3',
        'animate-in fade-in-0 duration-150 ease-out',
        pos?.side === 'left' ? 'slide-in-from-right-1' : 'slide-in-from-left-1'
      )}
    >
      <EntityCard entity={entity} onActivate={onActivate} />
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// EntityHoverLink — standalone hover trigger for use outside ShellDropdown.
// Used by the release drawer's artist + album text, and (later) chat
// @-mentions and any other inline entity reference. Manages its own 200ms /
// 120ms hover-bridge state so the popover stays open while the cursor moves
// diagonally onto the popover surface.
// ---------------------------------------------------------------------------

const HOVER_OPEN_MS = 200;
const HOVER_CLOSE_MS = 120;

export interface EntityHoverLinkProps {
  readonly entity: EntityPopoverData;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onActivate?: (entity: EntityPopoverData) => void;
}

export function EntityHoverLink({
  entity,
  children,
  className,
  onActivate,
}: EntityHoverLinkProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }, []);

  const requestOpen = useCallback(() => {
    cancelClose();
    if (openTimer.current !== undefined) return;
    openTimer.current = window.setTimeout(() => {
      setOpen(true);
      openTimer.current = undefined;
    }, HOVER_OPEN_MS);
  }, [cancelClose]);

  const requestClose = useCallback(() => {
    if (openTimer.current !== undefined) {
      window.clearTimeout(openTimer.current);
      openTimer.current = undefined;
    }
    if (closeTimer.current !== undefined) return;
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = undefined;
    }, HOVER_CLOSE_MS);
  }, []);

  useEffect(
    () => () => {
      if (openTimer.current !== undefined)
        window.clearTimeout(openTimer.current);
      if (closeTimer.current !== undefined)
        window.clearTimeout(closeTimer.current);
    },
    []
  );

  return (
    <>
      <button
        ref={setAnchor}
        type='button'
        onMouseEnter={requestOpen}
        onMouseLeave={requestClose}
        onFocus={requestOpen}
        onBlur={requestClose}
        onClick={() => onActivate?.(entity)}
        // Subtle treatment: underline only on hover/focus, no static
        // decoration — keeps entity-rich copy from reading as a wall of
        // dotted lines while still surfacing the affordance on intent.
        className={cn(
          'inline-flex items-center hover:text-primary-token transition-colors duration-150 ease-out',
          'no-underline hover:underline focus-visible:underline underline-offset-2',
          className
        )}
      >
        {children}
      </button>
      {open && anchor ? (
        <EntityPopover
          entity={entity}
          anchor={anchor}
          onPointerEnter={cancelClose}
          onPointerLeave={requestClose}
          onActivate={onActivate}
        />
      ) : null}
    </>
  );
}
