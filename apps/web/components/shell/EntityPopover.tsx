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

import { Gauge, Music, Users } from 'lucide-react';
import Image from 'next/image';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
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
      // Token cleanup: never surface raw Spotify URLs in subtitles (entity matching in chat/onboarding)
      if (entity.handle && !/open\.spotify\.com/i.test(entity.handle))
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
        <span className='flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-md border border-subtle bg-surface-1 shadow-app-control'>
          <span className='text-3xs font-caption leading-none text-tertiary-token'>
            {stamp.month}
          </span>
          <span className='mt-0.5 text-2xs font-bold leading-none text-primary-token'>
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
          'relative h-7 w-7 shrink-0 overflow-hidden shadow-app-control',
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
        'flex h-7 w-7 shrink-0 items-center justify-center border border-subtle bg-surface-1 text-3xs font-caption text-primary-token shadow-app-control',
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
      if (entity.handle && !/open\.spotify\.com/i.test(entity.handle))
        out.push({ key: 'handle', node: `@${entity.handle}` });
      if (entity.followers) {
        out.push({
          key: 'followers',
          node: (
            <span
              title={`${entity.followers.toLocaleString()} Spotify followers`}
              className='inline-flex items-center gap-1'
            >
              <Users className='h-3 w-3 text-tertiary-token' aria-hidden />
              <strong className='font-semibold tabular-nums text-primary-token'>
                {compactNumber(entity.followers)}
              </strong>
              <span className='sr-only'>followers</span>
            </span>
          ),
        });
      }
      if (typeof entity.popularity === 'number' && entity.popularity > 0) {
        out.push({
          key: 'pop',
          node: (
            <span
              title={`Spotify popularity: ${entity.popularity} / 100`}
              className='inline-flex items-center gap-1'
            >
              <Gauge className='h-3 w-3 text-tertiary-token' aria-hidden />
              <strong className='font-semibold tabular-nums text-primary-token'>
                {entity.popularity}
              </strong>
            </span>
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

// 48px hero artwork inside the card.
function CardArtwork({ entity }: { readonly entity: EntityPopoverData }) {
  if (entity.kind === 'event' && !entity.thumbnail) {
    const stamp = stampParts(entity.eventDate);
    if (stamp) {
      return (
        <div className='flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-surface-1'>
          <span className='text-3xs font-caption text-tertiary-token'>
            {stamp.month}
          </span>
          <span className='text-mid font-bold leading-none text-primary-token'>
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
          'relative h-12 w-12 shrink-0 overflow-hidden',
          isCircular ? 'rounded-full' : 'rounded-md'
        )}
      >
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='48px'
          className='object-cover'
          unoptimized
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center bg-surface-1 text-app font-caption text-primary-token',
        isCircular ? 'rounded-full' : 'rounded-md'
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
    <div className='flex items-start gap-2.5'>
      <CardArtwork entity={entity} />
      <div className='min-w-0 flex-1'>
        <div className='mb-0.5 text-2xs font-caption text-tertiary-token'>
          {eyebrow}
        </div>
        <h3 className='m-0 mb-1 truncate text-app font-caption leading-tight text-primary-token'>
          {entity.kind === 'artist' &&
          /open\.spotify\.com|spotify\.com\/artist/i.test(entity.label) ? (
            <span className='inline-flex items-center gap-1.5'>
              <Music
                className='h-3.5 w-3.5 shrink-0'
                style={{ color: '#1DB954' }}
                aria-hidden='true'
              />
              Spotify artist
            </span>
          ) : (
            entity.label
          )}
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
            className='mb-2 inline-flex items-center text-2xs font-caption text-secondary-token underline decoration-subtle underline-offset-2 transition-colors duration-subtle ease-subtle hover:text-primary-token hover:decoration-default'
          >
            {artistLink}
          </button>
        ) : null}
        {stats.length > 0 ? (
          <div className='flex flex-wrap items-center gap-x-1 gap-y-0.5 text-2xs leading-normal text-tertiary-token'>
            {stats.map((stat, i) => (
              <span
                key={stat.key}
                className={cn(
                  'relative inline-flex h-5 items-center whitespace-nowrap rounded-full',
                  stat.emphasis === 'solid'
                    ? 'border border-subtle bg-surface-1 px-1 text-3xs font-caption text-primary-token'
                    : 'px-0',
                  i > 0 &&
                    stat.emphasis !== 'solid' &&
                    'before:mr-1.5 before:h-0.5 before:w-0.5 before:rounded-full before:bg-quaternary-token before:content-[""]'
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

const POPOVER_WIDTH = 272;
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
        LINEAR_SURFACE.popover,
        'text-primary-token',
        'animate-in fade-in-0 zoom-in-95 duration-subtle ease-subtle',
        pos?.side === 'left' ? 'slide-in-from-right-1' : 'slide-in-from-left-1',
        'motion-reduce:transition-opacity motion-reduce:transform-none'
      )}
    >
      <div className='p-3'>
        <EntityCard entity={entity} onActivate={onActivate} />
      </div>
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

  const cancelOpen = useCallback(() => {
    if (openTimer.current !== undefined) {
      window.clearTimeout(openTimer.current);
      openTimer.current = undefined;
    }
  }, []);

  const closeNow = useCallback(() => {
    cancelOpen();
    cancelClose();
    setOpen(false);
  }, [cancelClose, cancelOpen]);

  const requestOpen = useCallback(() => {
    cancelClose();
    if (openTimer.current !== undefined) return;
    openTimer.current = window.setTimeout(() => {
      setOpen(true);
      openTimer.current = undefined;
    }, HOVER_OPEN_MS);
  }, [cancelClose]);

  const requestClose = useCallback(() => {
    cancelOpen();
    if (closeTimer.current !== undefined) return;
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = undefined;
    }, HOVER_CLOSE_MS);
  }, [cancelOpen]);

  useEffect(
    () => () => {
      cancelOpen();
      cancelClose();
    },
    [cancelClose, cancelOpen]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeNow();
    },
    [closeNow]
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
        onKeyDown={handleKeyDown}
        onClick={() => onActivate?.(entity)}
        // Subtle treatment: underline only on hover/focus, no static
        // decoration — keeps entity-rich copy from reading as a wall of
        // dotted lines while still surfacing the affordance on intent.
        className={cn(
          'inline-flex items-center rounded-md transition-colors duration-subtle ease-subtle hover:text-primary-token',
          'no-underline hover:underline focus-visible:underline underline-offset-2',
          'focus-ring-themed',
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
