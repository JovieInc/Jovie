'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@jovie/ui';
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
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef } from '@/lib/commands/entities';
import {
  type EnrichedFact,
  projectPublicEnrichedFacts,
} from '@/lib/profile-facts/enrichment';
import { cn } from '@/lib/utils';
import { EntityChip, type EntityChipTone } from './EntityChip';
import { ENTITY_KIND_ACCENT_VAR } from './entity-accent';
import { SourceFactCard } from './SourceFactCard';

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 120;
// Coordination belongs to the existing entity overlay owner, across transcripts/rails.
let activeInspection: { owner: object; close: () => void } | null = null;
let lastInspectionAt = 0;

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
  /** Current scoped read-model data. Missing/mismatched data hides historical labels and actions. */
  readonly entity?: EntityRef;
  readonly sourceFact?: EnrichedFact;
  /** The presentational EntityChip rendered as the trigger. */
  readonly children: ReactNode;
  readonly tone?: EntityChipTone;
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
  entity: candidate,
  sourceFact: candidateFact,
  children,
  tone = 'onDark',
}: EntityChipPopoverProps) {
  // A caller cannot attach another object's metadata or capability to this id.
  const entity =
    candidate?.kind === kind && candidate.id === id ? candidate : undefined;
  const sourceFact = useMemo(
    () =>
      candidateFact && candidateFact.id === id
        ? projectPublicEnrichedFacts(
            [candidateFact],
            candidateFact.subject.id
          )[0]
        : undefined,
    [candidateFact, id]
  );
  const label = sourceFact
    ? 'Inspect source'
    : (entity?.label ?? 'Unavailable reference');
  const mobile = useMediaQuery('(max-width: 639px)');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inspectionOwner = useRef({});
  const contentRef = useRef<HTMLDivElement>(null);
  const suppressFocus = useRef(false);
  const pointerDown = useRef(false);
  const restoreFocus = useRef(false);
  const openedByHover = useRef(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const entityPanel = useOptionalChatEntityPanel();
  const previewPanel = useOptionalPreviewPanelState();
  const entityPanelKind =
    kind === 'release'
      ? ('release' as const)
      : kind === 'event'
        ? ('tour-date' as const)
        : null;
  const canOpenEntityPanel =
    entity !== undefined && entityPanelKind !== null && entityPanel !== null;
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

  const closeInspection = useCallback(() => {
    clearTimers();
    if (activeInspection?.owner === inspectionOwner.current)
      activeInspection = null;
    setOpen(false);
  }, [clearTimers]);
  const openInspection = useCallback(() => {
    clearTimers();
    activeInspection?.close();
    activeInspection = {
      owner: inspectionOwner.current,
      close: closeInspection,
    };
    lastInspectionAt = Date.now();
    setOpen(true);
  }, [clearTimers, closeInspection]);
  useEffect(
    () => () => {
      if (activeInspection?.owner === inspectionOwner.current)
        activeInspection = null;
    },
    [closeInspection]
  );

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      // Pointer-aware devices only — touch fires synthetic mouse events but
      // we want tap to use the click path, not the hover path.
      if (event.pointerType !== 'mouse' || mobile) return;
      clearTimers();
      openTimerRef.current = setTimeout(
        () => {
          openedByHover.current = true;
          openInspection();
        },
        activeInspection || Date.now() - lastInspectionAt < 300
          ? 0
          : HOVER_OPEN_DELAY_MS
      );
    },
    [clearTimers, openInspection, mobile]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers();
      closeTimerRef.current = setTimeout(() => {
        if (
          !contentRef.current?.contains(document.activeElement) &&
          document.activeElement !== triggerRef.current
        )
          closeInspection();
      }, HOVER_CLOSE_DELAY_MS);
    },
    [clearTimers, closeInspection]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      // Radix Popover handles Space/Enter on the trigger natively, but we
      // also need to cancel hover timers so they don't compete with intent.
      if (event.key === 'Enter' || event.key === ' ') {
        clearTimers();
        if (open) {
          event.preventDefault();
          contentRef.current?.querySelector<HTMLElement>('a, button')?.focus();
        }
      }
    },
    [clearTimers, open]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      clearTimers();
      if (next) openInspection();
      else {
        if (activeInspection?.owner === inspectionOwner.current)
          activeInspection = null;
        setOpen(false);
      }
    },
    [clearTimers, openInspection]
  );

  const handleOpenEntityPanel = useCallback(() => {
    if (!canOpenEntityPanel || !entityPanel || !entityPanelKind) return;
    entityPanel.open({
      kind: entityPanelKind,
      id,
      label,
      source: 'manual',
      focusKey,
    });
    setOpen(false);
  }, [canOpenEntityPanel, entityPanel, entityPanelKind, id, label, focusKey]);

  const handleOpenProfilePreview = useCallback(() => {
    if (!previewPanel) return;
    entityPanel?.close();
    previewPanel.open();
    setOpen(false);
  }, [entityPanel, previewPanel]);

  const Root = mobile ? Sheet : Popover;
  const Trigger = mobile ? SheetTrigger : PopoverTrigger;
  const body = sourceFact ? (
    <SourceFactCard fact={sourceFact} />
  ) : (
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
  );
  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    if (restoreFocus.current) {
      suppressFocus.current = true;
      triggerRef.current?.focus({ preventScroll: true });
      suppressFocus.current = false;
      restoreFocus.current = false;
    }
  };
  return (
    <Root open={open} onOpenChange={handleOpenChange}>
      <Trigger asChild>
        <button
          ref={triggerRef}
          onClickCapture={event => {
            if (open && openedByHover.current) event.preventDefault();
            openedByHover.current = false;
            clearTimers();
          }}
          type='button'
          aria-haspopup='dialog'
          aria-expanded={open}
          aria-label={
            sourceFact
              ? `Inspect source: ${sourceFact.subject.displayName ?? 'Reference'}`
              : `${KIND_PREFIX[kind]}: ${label}`
          }
          onPointerDown={() => {
            pointerDown.current = true;
          }}
          onPointerUp={() => {
            pointerDown.current = false;
          }}
          onPointerCancel={() => {
            pointerDown.current = false;
          }}
          onFocus={() => {
            if (!mobile && !pointerDown.current && !suppressFocus.current)
              openInspection();
          }}
          onBlur={event => {
            if (!mobile && !contentRef.current?.contains(event.relatedTarget))
              handleOpenChange(false);
          }}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
          className='system-b-entity-chip-trigger focus-ring'
          data-testid='entity-chip-popover-trigger'
        >
          {entity || sourceFact ? (
            children
          ) : (
            <EntityChip
              data={{ kind, id, label }}
              variant='transcript'
              tone={tone}
            />
          )}
        </button>
      </Trigger>
      {mobile ? (
        <SheetContent
          side='bottom'
          ref={contentRef}
          testId='entity-chip-source-sheet'
          onEscapeKeyDown={() => {
            restoreFocus.current = true;
          }}
          onCloseAutoFocus={event => {
            restoreFocus.current = true;
            handleCloseAutoFocus(event);
          }}
        >
          <SheetTitle>{sourceFact ? 'Source details' : label}</SheetTitle>
          <SheetDescription className='sr-only'>
            Inspect evidence or open the source.
          </SheetDescription>
          {body}
        </SheetContent>
      ) : (
        <PopoverContent
          ref={contentRef}
          aria-label={sourceFact ? 'Source details' : label}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={handleCloseAutoFocus}
          onEscapeKeyDown={() => {
            restoreFocus.current = true;
          }}
          onFocusOutside={event => {
            if (event.target === triggerRef.current) event.preventDefault();
          }}
          className='w-68'
          size='bare'
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
              if (
                !contentRef.current?.contains(document.activeElement) &&
                document.activeElement !== triggerRef.current
              )
                closeInspection();
            }, HOVER_CLOSE_DELAY_MS);
          }}
        >
          {body}
        </PopoverContent>
      )}
    </Root>
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
