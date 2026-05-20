'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import {
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOptionalChatEntityPanel } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef, EntityRefMeta } from '@/lib/commands/entities';
import { useAppFlag } from '@/lib/flags/client';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils/initials';

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 120;

const KIND_PREFIX: Record<EntityKind, string> = {
  release: 'Release',
  artist: 'Artist',
  track: 'Track',
  event: 'Event',
};

interface EntityChipPopoverProps {
  readonly kind: EntityKind;
  readonly id: string;
  readonly label: string;
  /** Resolved entity data (when cache hit). When undefined, popover shows a minimal label-only body. */
  readonly entity?: EntityRef;
  /** The presentational EntityChip rendered as the trigger. */
  readonly children: ReactNode;
}

/**
 * Wraps a presentational `EntityChip` (transcript variant) in a focusable
 * popover trigger. The chip itself stays a non-interactive `<span>`; this
 * component owns all interaction semantics:
 *
 * - click / Enter / Space → toggle popover
 * - hover (pointer-aware devices only) → open after 200ms, close after 120ms
 * - Escape → close (Radix Popover handles by default)
 * - focus visible ring on the trigger
 *
 * Popover content is lazy-mounted (Radix only renders when open) so adding
 * one wrapper per transcript chip doesn't pay Popover state cost upfront.
 */
export function EntityChipPopover({
  kind,
  id,
  label,
  entity,
  children,
}: EntityChipPopoverProps) {
  const [open, setOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const designV1ChatEntitiesEnabled = useAppFlag('DESIGN_V1');
  const entityPanel = useOptionalChatEntityPanel();
  const canOpenEntityPanel =
    designV1ChatEntitiesEnabled && kind === 'release' && entityPanel !== null;

  const focusKey = useMemo(() => `${kind}:${id}:${label}`, [kind, id, label]);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      // Pointer-aware devices only — touch fires synthetic mouse events but
      // we want tap to use the click path, not the hover path.
      if (event.pointerType !== 'mouse') return;
      clearTimers();
      openTimerRef.current = setTimeout(() => {
        setOpen(true);
      }, HOVER_OPEN_DELAY_MS);
    },
    [clearTimers]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers();
      closeTimerRef.current = setTimeout(() => {
        setOpen(false);
      }, HOVER_CLOSE_DELAY_MS);
    },
    [clearTimers]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      // Radix Popover handles Space/Enter on the trigger natively, but we
      // also need to cancel hover timers so they don't compete with intent.
      if (event.key === 'Enter' || event.key === ' ') {
        clearTimers();
      }
    },
    [clearTimers]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      clearTimers();
      setOpen(next);
    },
    [clearTimers]
  );

  const handleOpenEntityPanel = useCallback(() => {
    if (!entityPanel) return;
    entityPanel.open({
      kind: 'release',
      id,
      label,
      source: 'manual',
      focusKey,
    });
    setOpen(false);
  }, [entityPanel, id, label, focusKey]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-haspopup='dialog'
          aria-expanded={open}
          aria-label={`${KIND_PREFIX[kind]}: ${label}`}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
          className={cn(
            'm-0 inline-flex cursor-pointer appearance-none items-baseline align-baseline border-0 bg-transparent p-0',
            'rounded-md focus:outline-none focus-visible:outline-none focus-ring'
          )}
          data-testid='entity-chip-popover-trigger'
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[272px] overflow-hidden p-0'
        sideOffset={6}
        align='start'
        testId='entity-chip-popover-content'
        onPointerEnter={() => {
          // Keep the popover open while the cursor is over its content.
          clearTimers();
        }}
        onPointerLeave={event => {
          if (event.pointerType !== 'mouse') return;
          closeTimerRef.current = setTimeout(() => {
            setOpen(false);
          }, HOVER_CLOSE_DELAY_MS);
        }}
      >
        <EntityChipPopoverBody
          kind={kind}
          label={label}
          entity={entity}
          canOpen={canOpenEntityPanel}
          onOpenEntity={handleOpenEntityPanel}
        />
      </PopoverContent>
    </Popover>
  );
}

interface EntityChipPopoverBodyProps {
  readonly kind: EntityKind;
  readonly label: string;
  readonly entity: EntityRef | undefined;
  readonly canOpen: boolean;
  readonly onOpenEntity: () => void;
}

function EntityChipPopoverBody({
  kind,
  label,
  entity,
  canOpen,
  onOpenEntity,
}: EntityChipPopoverBodyProps) {
  const eyebrow = entity ? eyebrowFor(entity) : KIND_PREFIX[kind];
  const subtitle = entity?.meta?.subtitle;
  const stats = entity?.meta ? compactStatsFor(entity.meta) : null;
  const thumbnail = entity?.thumbnail;

  return (
    <div className='flex gap-2.5 p-3'>
      <div className='shrink-0'>
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt=''
            width={48}
            height={48}
            className='h-12 w-12 rounded-md border border-subtle object-cover shadow-app-control'
            aria-hidden
          />
        ) : (
          <div
            aria-hidden
            className='flex h-12 w-12 items-center justify-center rounded-md border border-subtle bg-surface-1 text-app font-caption text-primary-token shadow-app-control'
          >
            {getInitials(label) || '·'}
          </div>
        )}
      </div>
      <div className='min-w-0 flex-1'>
        <p className='text-2xs font-caption text-tertiary-token'>{eyebrow}</p>
        <p className='mt-0.5 truncate text-app font-caption leading-tight text-primary-token'>
          {label}
        </p>
        {subtitle ? (
          <p className='mt-0.5 truncate text-2xs leading-tight text-secondary-token'>
            {subtitle}
          </p>
        ) : null}
        {stats ? (
          <p className='mt-1 truncate text-2xs leading-tight text-tertiary-token'>
            {stats}
          </p>
        ) : null}
        {canOpen ? (
          <button
            type='button'
            onClick={onOpenEntity}
            className='mt-2 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-2xs font-caption text-secondary-token transition-colors duration-subtle ease-subtle hover:bg-surface-1 hover:text-primary-token focus:outline-none focus-visible:outline-none focus-ring'
          >
            Open {KIND_PREFIX[kind].toLowerCase()}
            <ArrowUpRight className='h-3 w-3' />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function eyebrowFor(entity: EntityRef): string {
  const meta = entity.meta;
  if (!meta) return KIND_PREFIX[entity.kind];
  if (meta.kind === 'release') {
    const type = meta.releaseType
      ? meta.releaseType[0].toUpperCase() +
        meta.releaseType.slice(1).toLowerCase()
      : null;
    return type ? `Release · ${type}` : 'Release';
  }
  if (meta.kind === 'artist') {
    if (meta.isYou) return 'Artist · You';
    if (meta.verified) return 'Artist · Verified';
    return 'Artist';
  }
  if (meta.kind === 'event') {
    return meta.eventType
      ? `Event · ${meta.eventType[0].toUpperCase()}${meta.eventType.slice(1)}`
      : 'Event';
  }
  return 'Track';
}

function compactStatsFor(meta: EntityRefMeta): string | null {
  const parts: string[] = [];
  if (meta.kind === 'release') {
    if (typeof meta.totalTracks === 'number' && meta.totalTracks > 0) {
      parts.push(
        `${meta.totalTracks} ${meta.totalTracks === 1 ? 'track' : 'tracks'}`
      );
    }
    if (typeof meta.totalDurationMs === 'number' && meta.totalDurationMs > 0) {
      const totalSeconds = Math.round(meta.totalDurationMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      parts.push(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }
  } else if (meta.kind === 'artist') {
    if (typeof meta.followers === 'number' && meta.followers > 0) {
      parts.push(`${compactNumber(meta.followers)} followers`);
    }
  } else if (meta.kind === 'event') {
    if (meta.venue) parts.push(meta.venue);
    if (meta.city) parts.push(meta.city);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}
