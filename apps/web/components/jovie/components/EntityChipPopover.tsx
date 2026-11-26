'use client';

import {
  PlainButton,
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
import { ENTITY_KIND_LABEL, type EntityKind } from '@/lib/chat/tokens';
import type { EntityRef } from '@/lib/commands/entities';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';
import { cn } from '@/lib/utils';
import { EntityChip, type EntityChipTone } from './EntityChip';
import { ENTITY_KIND_ACCENT_VAR } from './entity-accent';
import { useProjectedSourceFact } from './useProjectedSourceFact';

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 120;
type InspectionIntent = 'hover' | 'engaged';

// One transcript inspection at a time. A hover can replace another hover,
// but must not dismiss a preview the user is operating by keyboard or click.
let activeInspection: {
  owner: object;
  intent: InspectionIntent;
  close: () => void;
} | null = null;
let lastInspectionAt = 0;

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

/** Transcript chip disclosure, using the same compact EntityCard as the rail. */
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
  const { sourceFact, pending, SourceFactCardView } = useProjectedSourceFact(
    candidateFact,
    id
  );
  const label = sourceFact
    ? 'Inspect source'
    : (entity?.label ?? 'Unavailable reference');
  const srOnlyName = sourceFact
    ? `Inspect source: ${sourceFact.subject.displayName ?? 'Reference'} — `
    : `${ENTITY_KIND_LABEL[kind]}: ${label} — `;
  const mobile = useMediaQuery('(max-width: 639px)');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inspectionOwner = useRef({});
  const contentRef = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const restoreFocus = useRef(false);
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

  useEffect(
    () => () => {
      clearTimers();
      if (activeInspection?.owner === inspectionOwner.current)
        activeInspection = null;
    },
    [clearTimers]
  );

  const closeInspection = useCallback(() => {
    clearTimers();
    if (activeInspection?.owner === inspectionOwner.current)
      activeInspection = null;
    setOpen(false);
  }, [clearTimers]);
  const openInspection = useCallback(
    (intent: InspectionIntent) => {
      clearTimers();
      if (activeInspection?.owner === inspectionOwner.current) {
        if (intent === 'engaged') activeInspection.intent = intent;
        return;
      }
      if (intent === 'hover' && activeInspection?.intent === 'engaged') return;

      activeInspection?.close();
      activeInspection = {
        owner: inspectionOwner.current,
        intent,
        close: closeInspection,
      };
      lastInspectionAt = Date.now();
      setOpen(true);
    },
    [clearTimers, closeInspection]
  );

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      // Touch uses the tap path, not hover.
      if (event.pointerType !== 'mouse' || mobile) return;
      clearTimers();
      openTimerRef.current = setTimeout(
        () => openInspection('hover'),
        activeInspection || Date.now() - lastInspectionAt < 300
          ? 0
          : HOVER_OPEN_DELAY_MS
      );
    },
    [clearTimers, openInspection, mobile]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers();
      if (activeInspection?.owner !== inspectionOwner.current) return;
      if (activeInspection.intent === 'hover')
        closeTimerRef.current = setTimeout(
          closeInspection,
          HOVER_CLOSE_DELAY_MS
        );
    },
    [clearTimers, closeInspection]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      // Enter and Space cancel queued hover before focusing actions.
      if (event.key === 'Enter' || event.key === ' ') {
        clearTimers();
        if (open) {
          event.preventDefault();
          contentRef.current
            ?.querySelector<HTMLElement>('a, button')
            ?.focus({ preventScroll: true });
        }
      }
    },
    [clearTimers, open]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => (next ? openInspection('engaged') : closeInspection()),
    [closeInspection, openInspection]
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
    closeInspection();
  }, [
    canOpenEntityPanel,
    entityPanel,
    entityPanelKind,
    id,
    label,
    focusKey,
    closeInspection,
  ]);

  const handleOpenProfilePreview = useCallback(() => {
    if (!previewPanel) return;
    entityPanel?.close();
    previewPanel.open();
    closeInspection();
  }, [entityPanel, previewPanel, closeInspection]);

  const Root = mobile ? Sheet : Popover;
  const Trigger = mobile ? SheetTrigger : PopoverTrigger;
  const body = sourceFact ? (
    SourceFactCardView ? (
      <SourceFactCardView fact={sourceFact} />
    ) : null
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
    const trigger = triggerRef.current;
    const focused = trigger?.ownerDocument.activeElement ?? null;
    if (
      restoreFocus.current &&
      trigger?.isConnected &&
      !activeInspection &&
      (focused === trigger.ownerDocument.body ||
        (event.target instanceof Node && event.target.contains(focused)))
    ) {
      trigger.focus({ preventScroll: true });
    }
    restoreFocus.current = false;
  };
  return (
    <Root open={open} onOpenChange={handleOpenChange}>
      <Trigger asChild>
        <PlainButton
          ref={triggerRef}
          onClickCapture={event => {
            clearTimers();
            if (
              activeInspection?.owner === inspectionOwner.current &&
              activeInspection.intent === 'hover'
            ) {
              // First click commits a preview already opened by hover. A
              // second click follows the normal Radix toggle-to-close path.
              event.preventDefault();
              openInspection('engaged');
            }
          }}
          aria-haspopup='dialog'
          aria-expanded={open}
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
            if (!mobile && !pointerDown.current && !restoreFocus.current)
              openInspection('engaged');
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
          {/* Acc name = sr-only prefix + rendered chip: the visible text must
              stay in the name (label-content-name-mismatch). */}
          <span className='sr-only'>{srOnlyName}</span>
          {entity || sourceFact || pending ? (
            children
          ) : (
            <EntityChip
              data={{ kind, id, label }}
              variant='transcript'
              tone={tone}
            />
          )}
        </PlainButton>
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
            // Closing an incidental hover must not move focus out of the
            // composer (or any other control the user never left).
            restoreFocus.current =
              contentRef.current?.contains(document.activeElement) ?? false;
          }}
          onFocusCapture={() => openInspection('engaged')}
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
          onPointerEnter={clearTimers}
          onPointerLeave={handlePointerLeave}
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
    // The creator's own profile reads as them, the artist.
    kind: kind === 'profile' ? 'artist' : kind,
    id,
    label: entity?.label ?? label,
    thumbnail: entity?.thumbnail ?? null,
    isYou: kind === 'profile' || undefined,
  };

  if (!meta) return base;

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
          onClick: onOpenProfilePreview,
        }
      : canOpen
        ? {
            label: `Open ${ENTITY_KIND_LABEL[kind]}`,
            onClick: onOpenEntity,
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
