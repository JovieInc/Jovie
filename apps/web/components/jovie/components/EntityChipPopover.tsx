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
import { useOptionalPreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef, EntityRefMeta } from '@/lib/commands/entities';
import { useAppFlag } from '@/lib/flags/client';
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
  const previewPanel = useOptionalPreviewPanelState();
  const canOpenEntityPanel =
    designV1ChatEntitiesEnabled && kind === 'release' && entityPanel !== null;
  const canOpenProfilePreview =
    kind === 'artist' &&
    previewPanel !== null &&
    entity?.meta?.kind === 'artist' &&
    entity.meta.isYou === true;

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

  const handleOpenProfilePreview = useCallback(() => {
    if (!previewPanel) return;
    entityPanel?.close();
    previewPanel.open();
    setOpen(false);
  }, [entityPanel, previewPanel]);

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
          className='system-b-entity-chip-trigger focus-ring'
          data-testid='entity-chip-popover-trigger'
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className='system-b-entity-chip-popover-content'
        side='top'
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
          canOpenProfilePreview={canOpenProfilePreview}
          onOpenProfilePreview={handleOpenProfilePreview}
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
  readonly canOpenProfilePreview: boolean;
  readonly onOpenProfilePreview: () => void;
}

function EntityChipPopoverBody({
  kind,
  label,
  entity,
  canOpen,
  onOpenEntity,
  canOpenProfilePreview,
  onOpenProfilePreview,
}: EntityChipPopoverBodyProps) {
  const eyebrow = entity ? eyebrowFor(entity) : KIND_PREFIX[kind];
  const subtitle = entity?.meta?.subtitle;
  const stats = entity?.meta ? compactStatsFor(entity.meta) : null;
  const thumbnail = entity?.thumbnail;

  return (
    <div className='system-b-entity-chip-popover-body'>
      <div className='system-b-entity-chip-popover-media'>
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt=''
            width={48}
            height={48}
            className='system-b-entity-chip-popover-thumbnail'
            aria-hidden
          />
        ) : (
          <div aria-hidden className='system-b-entity-chip-popover-placeholder'>
            {getInitials(label) || '·'}
          </div>
        )}
      </div>
      <div className='system-b-entity-chip-popover-copy'>
        <p className='system-b-entity-chip-popover-eyebrow'>{eyebrow}</p>
        <p className='system-b-entity-chip-popover-title'>{label}</p>
        {subtitle ? (
          <p className='system-b-entity-chip-popover-subtitle'>{subtitle}</p>
        ) : null}
        {stats ? (
          <p className='system-b-entity-chip-popover-stats'>{stats}</p>
        ) : null}
        {canOpenProfilePreview ? (
          <button
            type='button'
            onClick={onOpenProfilePreview}
            className='system-b-entity-chip-popover-action focus-ring'
          >
            Open live profile preview
            <ArrowUpRight className='system-b-entity-chip-popover-action-icon' />
          </button>
        ) : null}
        {canOpen ? (
          <button
            type='button'
            onClick={onOpenEntity}
            className='system-b-entity-chip-popover-action focus-ring'
          >
            Open {KIND_PREFIX[kind]}
            <ArrowUpRight className='system-b-entity-chip-popover-action-icon' />
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
