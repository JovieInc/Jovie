'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import {
  type CSSProperties,
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
import {
  type ChatEntityMentionInput,
  chatEntityMentionToEntityCard,
  EntityCard,
} from '@/components/organisms/entity-card';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef } from '@/lib/commands/entities';
import { useAppFlag } from '@/lib/flags/client';
import { cn } from '@/lib/utils';
import { ENTITY_KIND_ACCENT_VAR } from './entity-accent';

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
 * Popover content renders the canonical compact `EntityCard` (same component
 * as the chat right rail) so every entity surface shares one anatomy.
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
        className='system-b-entity-chip-popover-content border-0 bg-transparent p-0 shadow-none'
        side='top'
        sideOffset={6}
        align='start'
        testId='entity-chip-popover-content'
        data-entity-kind={kind}
        style={
          {
            '--jovie-entity-accent': `var(${ENTITY_KIND_ACCENT_VAR[kind]})`,
          } as CSSProperties
        }
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
          id={id}
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
  readonly id: string;
  readonly label: string;
  readonly entity: EntityRef | undefined;
  readonly canOpen: boolean;
  readonly onOpenEntity: () => void;
  readonly canOpenProfilePreview: boolean;
  readonly onOpenProfilePreview: () => void;
}

function toMentionInput(
  kind: EntityKind,
  id: string,
  label: string,
  entity: EntityRef | undefined
): ChatEntityMentionInput {
  const meta = entity?.meta;
  const base: ChatEntityMentionInput = {
    kind,
    id,
    label: entity?.label ?? label,
    thumbnail: entity?.thumbnail ?? null,
  };

  if (!meta) {
    return base;
  }

  if (meta.kind === 'release') {
    return {
      ...base,
      subtitle: meta.subtitle,
      releaseType: meta.releaseType,
      totalTracks: meta.totalTracks,
      totalDurationMs: meta.totalDurationMs,
    };
  }
  if (meta.kind === 'artist') {
    return {
      ...base,
      subtitle: meta.subtitle,
      followers: meta.followers,
      verified: meta.verified,
      isYou: meta.isYou,
    };
  }
  if (meta.kind === 'event') {
    return {
      ...base,
      subtitle: meta.subtitle,
      venue: meta.venue,
      city: meta.city,
      eventType: meta.eventType,
      eventDate: meta.eventDate,
    };
  }
  return {
    ...base,
    subtitle: meta.subtitle,
    durationMs: meta.durationMs,
    releaseTitle: meta.releaseTitle,
  };
}

function EntityChipPopoverBody({
  kind,
  id,
  label,
  entity,
  canOpen,
  onOpenEntity,
  canOpenProfilePreview,
  onOpenProfilePreview,
}: EntityChipPopoverBodyProps) {
  const model = useMemo(() => {
    const mention = toMentionInput(kind, id, label, entity);
    const interactive = canOpen || canOpenProfilePreview;
    const cta = canOpenProfilePreview
      ? {
          label: 'Open Live Profile Preview',
          onClick: () => {
            onOpenProfilePreview();
          },
        }
      : canOpen
        ? {
            label: `Open ${KIND_PREFIX[kind]}`,
            onClick: () => {
              onOpenEntity();
            },
          }
        : null;

    return chatEntityMentionToEntityCard(mention, {
      interactive,
      cta,
    });
  }, [
    kind,
    id,
    label,
    entity,
    canOpen,
    canOpenProfilePreview,
    onOpenEntity,
    onOpenProfilePreview,
  ]);

  return (
    <EntityCard
      model={model}
      treatment='compact'
      className={cn('w-full shadow-popover')}
      dataTestId='entity-chip-popover-card'
    />
  );
}
