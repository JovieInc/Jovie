'use client';

import { motion, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useRegisterComposerFocus } from '@/components/features/chat/Composer';
import { DictationWaveform } from '@/components/shell/DictationWaveform';
import {
  insertLargeTextAtCaret,
  shouldChunkLargePaste,
} from '@/lib/chat/large-text-paste';
import { serializeEntity, serializeSkill } from '@/lib/chat/tokens';
import type { TranscriberErrorCode } from '@/lib/chat/transcriber';
import { SYSTEM_B_RADIUS_PX } from '@/lib/design/system-b-radius';
import { useEntityRecents } from '@/lib/queries/useEntityRecents';
import { cn } from '@/lib/utils';

import { CHAT_COMPOSER_MAX_WIDTH } from '../chat-layout';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import {
  HIDDEN_DIV_STYLES,
  useTextareaAutosize,
} from '../hooks/useTextareaAutosize';
import { MAX_MESSAGE_LENGTH } from '../types';
import {
  ComposerAttachButton,
  ComposerMicButton,
  ComposerSendButton,
} from './ChatComposerToolbar';
import { ChipTray } from './ChipTray';
import { SPRING_HEIGHT, TRANSITION_SURFACE } from './chat-motion';
import { EntityPreviewPane } from './EntityPreviewPane';
import {
  activeEntityFor,
  SlashCommandMenu,
  useSlashItems,
} from './SlashCommandMenu';
import { detectSlashTriggerAt } from './slash-trigger';
import { useChatPicker } from './useChatPicker';

interface ChatQuickAction {
  readonly label: string;
  readonly prompt: string;
}

export interface ChatInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (e?: React.FormEvent) => void;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly placeholder?: string;
  readonly variant?: 'default' | 'compact' | 'hero';
  readonly onFileAttach?: () => void;
  readonly isFileProcessing?: boolean;
  readonly pendingFiles?: import('../hooks/useChatFileAttachments').PendingFile[];
  readonly onRemoveFile?: (id: string) => void;
  readonly onPaste?: (e: React.ClipboardEvent) => void;
  readonly quickActions?: readonly ChatQuickAction[];
  readonly onQuickActionSelect?: (prompt: string) => void;
  /** Whether the AI is currently streaming a response */
  readonly isStreaming?: boolean;
  /** Stop the current generation */
  readonly onStop?: () => void;
  /** Chip tray state (from useChipTray). When omitted, chip UI is not rendered. */
  readonly chips?: readonly import('../hooks/useChipTray').TrayChip[];
  readonly onRemoveChipAt?: (index: number) => void;
  readonly onRemoveLastChip?: () => void;
  readonly onAddSkill?: (id: string) => void;
  readonly onAddEntity?: (
    mention: Omit<import('@/lib/chat/tokens').EntityMentionToken, 'type'>
  ) => void;
  /**
   * Notifies the surrounding chrome (suggestion chips, etc) when the slash
   * picker opens or closes so it can dim out neighbouring affordances per
   * Variant F.
   */
  readonly onPickerOpenChange?: (open: boolean) => void;
  /**
   * Required when chips/entity-pickers are wired up — used by the inline
   * slash picker to scope `useReleasesQuery` to the active creator.
   */
  readonly profileId?: string;
  /** Optional compact status content rendered inside the composer surface. */
  readonly statusBanner?: ReactNode;
}

type SurfaceMode = 'empty' | 'typing' | 'root' | 'entity';

interface SurfaceGeometry {
  readonly width: string;
  readonly maxWidth: string;
  readonly borderRadius: number;
}

function geometryFor(
  mode: SurfaceMode,
  stacked: boolean,
  variant: NonNullable<ChatInputProps['variant']>,
  usePillLayout: boolean
): SurfaceGeometry {
  const width = '100%';
  const maxWidth = `min(calc(100vw - 32px), ${CHAT_COMPOSER_MAX_WIDTH})`;
  // Radius values come only from SYSTEM_B_RADIUS_PX (JOV-3532).
  if (stacked) {
    return { width, maxWidth, borderRadius: SYSTEM_B_RADIUS_PX['3xl'] };
  }
  if (mode === 'entity') {
    return { width, maxWidth, borderRadius: SYSTEM_B_RADIUS_PX['3xl'] };
  }
  if (variant === 'hero' && usePillLayout) {
    return { width, maxWidth, borderRadius: SYSTEM_B_RADIUS_PX.pill };
  }
  if (variant === 'hero') {
    return { width, maxWidth, borderRadius: SYSTEM_B_RADIUS_PX['3xl'] };
  }
  return { width, maxWidth, borderRadius: SYSTEM_B_RADIUS_PX['3xl'] };
}

function pickerKindNoun(kind: import('@/lib/chat/tokens').EntityKind): string {
  if (kind === 'release') return 'release';
  if (kind === 'artist') return 'artist';
  if (kind === 'event') return 'event';
  return 'reference';
}

function pickerKindArticle(
  kind: import('@/lib/chat/tokens').EntityKind
): string {
  // Vowel-initial nouns get "an"; everything else "a".
  return kind === 'artist' || kind === 'event' ? 'an' : 'a';
}

function dictationErrorMessage(code: TranscriberErrorCode): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
      return 'Microphone access was denied. You can keep typing your message.';
    case 'no-speech':
      return "Didn't catch speech — try again or keep typing.";
    case 'network':
      return 'Dictation needs a network connection. You can keep typing.';
    default:
      return 'Dictation unavailable right now. You can keep typing.';
  }
}

function DictationStatusBanner({
  isListening,
  error,
  onDismissError,
}: {
  readonly isListening: boolean;
  readonly error: TranscriberErrorCode | null;
  readonly onDismissError: () => void;
}) {
  if (!isListening && !error) return null;

  if (error) {
    return (
      <div
        role='alert'
        className='flex items-center justify-between gap-3 px-3 py-2 text-xs text-tertiary-token'
      >
        <span>{dictationErrorMessage(error)}</span>
        <button
          type='button'
          onClick={onDismissError}
          className='shrink-0 rounded-md px-2 py-1 text-2xs text-primary-token hover:bg-surface-1/60'
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div
      role='status'
      aria-live='polite'
      className='flex items-center gap-3 px-3 py-2'
    >
      <DictationWaveform active bars={16} className='h-6 w-28' />
      <div className='min-w-0'>
        <div className='text-xs font-medium text-primary-token'>Listening</div>
        <div className='text-2xs text-tertiary-token'>
          Speak now — release the mic when finished
        </div>
      </div>
    </div>
  );
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput(
    {
      value,
      onChange,
      onSubmit,
      isLoading,
      isSubmitting,
      placeholder = 'What are you working on?',
      variant = 'default',
      onFileAttach,
      isFileProcessing = false,
      pendingFiles,
      onRemoveFile,
      onPaste,
      quickActions,
      onQuickActionSelect,
      isStreaming = false,
      onStop,
      chips,
      onRemoveChipAt,
      onRemoveLastChip,
      onAddSkill,
      onAddEntity,
      onPickerOpenChange,
      profileId,
      statusBanner,
    },
    ref
  ) {
    const reducedMotion = useReducedMotion();
    const characterCount = value.length;
    const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.9;
    const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;
    const hasAttachButton = Boolean(onFileAttach);
    const hasPendingFiles = (pendingFiles?.length ?? 0) > 0;
    const hasChips = (chips?.length ?? 0) > 0;

    const { setComposerFocused } = useRegisterComposerFocus();
    const [plusMenuOpen, setPlusMenuOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isViewportNarrow, setIsViewportNarrow] = useState(false);
    // Stable id for the slash picker listbox; used for textarea ARIA wiring
    // (`aria-controls`) and to compose row ids for `aria-activedescendant`.
    const pickerListId = useId();
    const [pickerActiveRowId, setPickerActiveRowId] = useState<string | null>(
      null
    );

    // Variant F's "compact" rule fires below ~900px viewport (or any time the
    // composer was already rendered in the compact follow-up variant). At that
    // size the entity surface stacks rail-on-top instead of two columns.
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const mq = window.matchMedia('(max-width: 899px)');
      const update = () => setIsViewportNarrow(mq.matches);
      update();
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }, []);

    const isCompact = variant === 'compact';
    const isHero = variant === 'hero';
    const isStacked = isCompact || isViewportNarrow;
    const maxHeight = 168;
    const minHeight = 24;

    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const latestOnChangeRef = useRef(onChange);
    const latestValueRef = useRef(value);
    useImperativeHandle(ref, () => internalTextareaRef.current!, []);

    useEffect(() => {
      latestOnChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      latestValueRef.current = value;
    }, [value]);

    useEffect(() => {
      const textarea = internalTextareaRef.current;
      if (!textarea) return;

      const syncDomValue = () => {
        const nextValue = textarea.value;
        if (nextValue !== latestValueRef.current) {
          latestOnChangeRef.current(nextValue);
        }
      };

      syncDomValue();
      textarea.addEventListener('input', syncDomValue);
      textarea.addEventListener('change', syncDomValue);

      return () => {
        textarea.removeEventListener('input', syncDomValue);
        textarea.removeEventListener('change', syncDomValue);
      };
    }, []);

    const { measuredHeight, isAtMaxHeight, containerRef, hiddenDivRef } =
      useTextareaAutosize({
        value,
        minHeight,
        maxHeight,
        textareaRef: internalTextareaRef,
      });

    const dictationBaselineRef = useRef('');
    const picker = useChatPicker();
    // Picker queries scope to this profile's catalog when present; absent
    // profileId yields an empty release set (artist search is global).
    const pickerProfileId = profileId ?? '';
    const { record: recordRecentEntity } = useEntityRecents(pickerProfileId);
    const { items: pickerItems, sections: _sections } = useSlashItems(
      picker.state,
      pickerProfileId
    );
    const activeEntity = activeEntityFor(picker.state, pickerItems);
    const isPickerOpen = picker.state.status !== 'closed';
    const isRootPickerOpen = picker.state.status === 'root';
    // Treat a lone leading "/" as picker bait, not a real message — the picker
    // is open above it and Enter is committing the active row, not sending.
    const sendBlockedByPicker = isPickerOpen && value.trim() === '/';
    const canSend =
      Boolean(value.trim() || hasPendingFiles || hasChips) &&
      !isLoading &&
      !isSubmitting &&
      !isOverLimit &&
      !isFileProcessing &&
      !sendBlockedByPicker;

    const handlePickerClose = useCallback(() => {
      onPickerOpenChange?.(false);
      picker.close();
    }, [onPickerOpenChange, picker]);

    // Slash trigger detection: open root picker when `/` follows a word
    // boundary; switch to entity picker when a skill commit demands it; or
    // jump straight to a kind-locked entity picker when the user typed a
    // direct prefix like `/release ` or `/event `.
    const handleChange = useCallback(
      (next: string) => {
        onChange(next);
        const el = internalTextareaRef.current;
        const caret = el?.selectionStart ?? next.length;
        const trigger = detectSlashTriggerAt(next, caret);
        if (trigger) {
          if (trigger.directKind) {
            // Direct entry. Promote regardless of current status — the user
            // either typed `/release ` from scratch (was 'closed' or 'root')
            // or converted an existing `/foo` into `/release foo` while in
            // root mode. The picker reducer accepts open-entity from any
            // state.
            onPickerOpenChange?.(true);
            picker.openEntity(
              trigger.directKind,
              trigger.startIdx,
              trigger.query
            );
            return;
          }
          if (
            picker.state.status === 'closed' ||
            picker.state.status === 'root'
          ) {
            onPickerOpenChange?.(true);
            picker.openRoot(trigger.startIdx, trigger.query);
          } else {
            // entity mode: only update query (kind stays locked)
            picker.setQuery(trigger.query);
          }
        } else if (picker.state.status === 'root') {
          handlePickerClose();
        }
      },
      [handlePickerClose, onChange, onPickerOpenChange, picker]
    );

    const stripSlashQuery = useCallback((): number => {
      if (picker.state.status === 'closed') return value.length;
      const startIdx = picker.state.startIdx;
      const el = internalTextareaRef.current;
      const caret = el?.selectionStart ?? value.length;
      const nextValue = value.slice(0, startIdx) + value.slice(caret);
      onChange(nextValue);
      return startIdx;
    }, [onChange, picker.state, value]);

    const replaceSlashQueryWithToken = useCallback(
      (token: string): number => {
        if (picker.state.status === 'closed') return value.length;
        const startIdx = picker.state.startIdx;
        const el = internalTextareaRef.current;
        const caret = el?.selectionStart ?? value.length;
        const before = value.slice(0, startIdx);
        const after = value.slice(caret);
        const leadingSpace =
          before.length > 0 && !/\s$/.test(before) ? ' ' : '';
        const trailingSpace = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
        const replacement = `${leadingSpace}${token}${trailingSpace}`;
        const nextValue = before + replacement + after;
        const nextCaret = before.length + replacement.length;
        onChange(nextValue);
        globalThis.setTimeout(() => {
          internalTextareaRef.current?.focus();
          internalTextareaRef.current?.setSelectionRange(nextCaret, nextCaret);
        }, 0);
        return nextCaret;
      },
      [onChange, picker.state, value]
    );

    const handleSelectSkill = useCallback(
      (skill: import('@/lib/commands/registry').SkillCommand) => {
        if (onAddSkill) {
          const nextCaret = stripSlashQuery();
          onAddSkill(skill.id);
          const requiredSlot = skill.entitySlots.find(s => s.required);
          if (requiredSlot && picker.state.status !== 'closed') {
            onPickerOpenChange?.(true);
            picker.openEntity(requiredSlot.kind, nextCaret, '');
          } else {
            handlePickerClose();
          }
          return;
        }

        const nextCaret = replaceSlashQueryWithToken(serializeSkill(skill.id));
        const requiredSlot = skill.entitySlots.find(s => s.required);
        if (requiredSlot && picker.state.status !== 'closed') {
          onPickerOpenChange?.(true);
          picker.openEntity(requiredSlot.kind, nextCaret, '');
        } else {
          handlePickerClose();
        }
      },
      [
        handlePickerClose,
        onAddSkill,
        onPickerOpenChange,
        picker,
        replaceSlashQueryWithToken,
        stripSlashQuery,
      ]
    );

    const handleSelectEntity = useCallback(
      (entity: import('@/lib/commands/entities').EntityRef) => {
        // Remember every tagged entity so it ranks first next time (own graph).
        recordRecentEntity(entity);
        if (onAddEntity) {
          stripSlashQuery();
          onAddEntity({
            kind: entity.kind,
            id: entity.id,
            label: entity.label,
          });
          handlePickerClose();
          return;
        }

        replaceSlashQueryWithToken(
          serializeEntity({
            kind: entity.kind,
            id: entity.id,
            label: entity.label,
          })
        );
        handlePickerClose();
      },
      [
        handlePickerClose,
        onAddEntity,
        recordRecentEntity,
        replaceSlashQueryWithToken,
        stripSlashQuery,
      ]
    );

    const handleSelectPromptAction = useCallback(
      (prompt: string) => {
        stripSlashQuery();
        handlePickerClose();
        onQuickActionSelect?.(prompt);
      },
      [handlePickerClose, onQuickActionSelect, stripSlashQuery]
    );

    const {
      isSupported: isDictationSupported,
      isListening,
      error: dictationError,
      clearError: clearDictationError,
      start: startDictation,
      stop: stopDictation,
      toggle: toggleDictation,
    } = useSpeechRecognition({
      onTranscript: sessionTranscript => {
        onChange(dictationBaselineRef.current + sessionTranscript);
      },
    });

    const scheduleTextareaRefocus = useCallback(() => {
      globalThis.setTimeout(() => {
        internalTextareaRef.current?.focus();
      }, 0);
    }, []);

    const captureDictationBaseline = useCallback(() => {
      dictationBaselineRef.current = value;
    }, [value]);

    const handleMicPushStart = useCallback(() => {
      if (isListening) return;
      captureDictationBaseline();
      startDictation();
    }, [captureDictationBaseline, isListening, startDictation]);

    const handleMicPushEnd = useCallback(() => {
      if (!isListening) return;
      stopDictation();
    }, [isListening, stopDictation]);

    const handleMicToggle = useCallback(() => {
      if (!isListening) {
        captureDictationBaseline();
      }
      toggleDictation();
    }, [captureDictationBaseline, isListening, toggleDictation]);

    const handleFormSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(e);
        scheduleTextareaRefocus();
      },
      [onSubmit, scheduleTextareaRefocus]
    );

    const handleSendClick = useCallback(() => {
      onSubmit();
      scheduleTextareaRefocus();
    }, [onSubmit, scheduleTextareaRefocus]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        // SlashCommandMenu owns Escape while the picker is open (capture phase).
        if (e.key === 'Escape' && picker.state.status === 'closed') {
          e.preventDefault();
          internalTextareaRef.current?.blur();
          setComposerFocused(false);
          return;
        }
        // While the picker is open, swallow Enter — SlashCommandMenu owns it.
        if (picker.state.status !== 'closed' && e.key === 'Enter') return;
        if (e.key === 'Enter' && !e.shiftKey && canSend) {
          e.preventDefault();
          onSubmit();
          scheduleTextareaRefocus();
          return;
        }
        if (
          e.key === 'Backspace' &&
          !value &&
          (chips?.length ?? 0) > 0 &&
          onRemoveLastChip
        ) {
          e.preventDefault();
          onRemoveLastChip();
        }
      },
      [
        onSubmit,
        canSend,
        value,
        chips,
        onRemoveLastChip,
        picker.state,
        scheduleTextareaRefocus,
        setComposerFocused,
      ]
    );

    const handlePreserveFocus = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
      },
      []
    );

    const handlePaste = useCallback(
      (event: React.ClipboardEvent) => {
        const hasFileItems = Array.from(event.clipboardData.items).some(
          item => item.kind === 'file'
        );
        if (hasFileItems) {
          onPaste?.(event);
          return;
        }

        const pastedText = event.clipboardData.getData('text/plain');
        if (!shouldChunkLargePaste(pastedText.length)) {
          onPaste?.(event);
          return;
        }

        const textarea = internalTextareaRef.current;
        if (!textarea) return;

        event.preventDefault();
        insertLargeTextAtCaret({
          textarea,
          pastedText,
          currentValue: value,
          onValueChange: handleChange,
          maxLength: MAX_MESSAGE_LENGTH + 100,
        });
      },
      [handleChange, onPaste, value]
    );

    // Resolve the surface mode from textarea + picker state. Shell + Chat V1
    // keeps empty focus calm so the composer doesn't reflow just because the
    // textarea received focus.
    // Attachment chips render above the composer in ChatComposerSurface;
    // only typed draft text should expand the inline field geometry.
    const hasText = Boolean(value.trim());
    const isExpanded = plusMenuOpen || isListening || hasText || isFocused;
    let surfaceMode: SurfaceMode = 'empty';
    if (picker.state.status === 'entity') surfaceMode = 'entity';
    else if (picker.state.status === 'root') surfaceMode = 'root';
    else if (hasText || plusMenuOpen || isListening) surfaceMode = 'typing';

    const hasInlineContent = Boolean(value.trim()) || hasChips;
    const hasOnlyRootSlashQuery =
      picker.state.status === 'root' &&
      value.trim().startsWith('/') &&
      !hasChips;
    const useHeroPill = isHero && (!hasInlineContent || hasOnlyRootSlashQuery);
    const geometry = geometryFor(surfaceMode, isStacked, variant, useHeroPill);
    const showInlinePicker = picker.state.status === 'root';
    const showEntitySurface = picker.state.status === 'entity';
    const reserveInlinePickerSpace =
      showInlinePicker && variant === 'compact' && !onPickerOpenChange;
    const dockClass = reserveInlinePickerSpace
      ? 'relative flex flex-col items-center'
      : surfaceMode === 'entity' && !isStacked
        ? 'relative flex justify-end'
        : 'relative flex justify-center';
    // Container the slash key listener cares about when the picker is closed.
    // (The active-listener inside SlashCommandMenu only mounts while open.)

    // Refocus textarea when the picker closes so typing can continue.
    // We track "picker was open last render" to scope the focus restore: the
    // AttachDropdown (Radix) also restores focus on close, and racing with it
    // can leave focus on the dropdown trigger. Deferring to a 0ms timeout
    // lets Radix run first, then we put focus back where it belongs.
    const wasPickerOpenRef = useRef(isPickerOpen);
    useEffect(() => {
      const wasOpen = wasPickerOpenRef.current;
      wasPickerOpenRef.current = isPickerOpen;
      if (!isPickerOpen && wasOpen && isFocused) {
        const handle = setTimeout(() => {
          internalTextareaRef.current?.focus();
        }, 0);
        return () => clearTimeout(handle);
      }
    }, [isPickerOpen, isFocused]);

    useLayoutEffect(() => {
      onPickerOpenChange?.(picker.state.status !== 'closed');
    }, [picker.state.status, onPickerOpenChange]);

    const dictationBanner = (
      <DictationStatusBanner
        isListening={isListening}
        error={dictationError}
        onDismissError={clearDictationError}
      />
    );
    const showDictationBanner = isListening || Boolean(dictationError);

    return (
      <form
        onSubmit={handleFormSubmit}
        aria-label='Compose A Message — Type / For Skills And References'
        className='relative z-10 w-full focus-within:outline-none'
      >
        <div className={dockClass}>
          {/* ROOT inline picker is absolutely positioned so it does not alter
              the composer surface height and cause layout shift when it opens. */}
          {showInlinePicker ? (
            <div
              className={cn(
                reserveInlinePickerSpace
                  ? 'relative z-[80] flex w-full justify-center'
                  : 'absolute bottom-full left-0 right-0 z-[80] flex justify-center',
                statusBanner ? 'mb-9' : 'mb-4'
              )}
            >
              <div
                style={{
                  width: geometry.width,
                  maxWidth: geometry.maxWidth,
                }}
                className='system-b-chat-composer-picker-shell isolate max-h-[min(340px,calc(100vh-12rem))] overflow-hidden'
              >
                <SlashCommandMenu
                  profileId={pickerProfileId}
                  state={picker.state}
                  onSelectSkill={handleSelectSkill}
                  onSelectEntity={handleSelectEntity}
                  onSetSelected={picker.setSelected}
                  onMoveSelected={picker.moveSelected}
                  onClose={handlePickerClose}
                  variant='inline'
                  listIdProp={pickerListId}
                  onActiveRowChange={setPickerActiveRowId}
                  promptActions={quickActions}
                  onSelectPrompt={handleSelectPromptAction}
                />
              </div>
            </div>
          ) : null}
          <motion.div
            layoutId='jovie-composer-surface'
            data-testid='chat-composer-surface'
            data-surface-mode={surfaceMode}
            data-compact={isCompact ? 'true' : 'false'}
            data-variant={variant}
            data-hero={isHero ? 'true' : undefined}
            data-expanded={isExpanded ? 'true' : undefined}
            data-over-limit={isOverLimit ? 'true' : undefined}
            animate={
              reducedMotion
                ? undefined
                : {
                    width: geometry.width,
                    maxWidth: geometry.maxWidth,
                    borderRadius: geometry.borderRadius,
                  }
            }
            transition={reducedMotion ? undefined : TRANSITION_SURFACE}
            style={{
              borderRadius: geometry.borderRadius,
              width: geometry.width,
              maxWidth: geometry.maxWidth,
              maxHeight: 'min(42vh, 280px)',
            }}
            className={cn(
              'system-b-chat-composer-surface overflow-hidden outline-none ring-0 focus-within:outline-none',
              showEntitySurface && !isStacked ? 'flex' : 'flex flex-col'
            )}
          >
            {showEntitySurface && !isStacked ? (
              <div className='flex w-full'>
                <aside className='system-b-chat-composer-seam flex w-66 shrink-0 flex-col border-r'>
                  <SlashCommandMenu
                    profileId={pickerProfileId}
                    state={picker.state}
                    onSelectSkill={handleSelectSkill}
                    onSelectEntity={handleSelectEntity}
                    onSetSelected={picker.setSelected}
                    onMoveSelected={picker.moveSelected}
                    onClose={handlePickerClose}
                    variant='rail'
                    listIdProp={pickerListId}
                    onActiveRowChange={setPickerActiveRowId}
                  />
                </aside>
                <div className='flex min-w-0 flex-1 flex-col'>
                  {activeEntity ? (
                    <EntityPreviewPane entity={activeEntity} />
                  ) : (
                    <div className='system-b-chat-composer-preview-empty flex-1 px-6'>
                      Pick {pickerKindArticle(picker.state.kind)}{' '}
                      {pickerKindNoun(picker.state.kind)} to preview.
                    </div>
                  )}
                  {statusBanner ? (
                    <div className='system-b-chat-composer-seam border-t'>
                      {statusBanner}
                    </div>
                  ) : null}
                  {/* Grid accordion reserves height while animating dictation
                      banner in/out — avoids the ~64px jump (JOV-11948). */}
                  {isDictationSupported ? (
                    <div
                      className={cn(
                        'grid transition-[grid-template-rows] duration-subtle ease-in-out',
                        showDictationBanner
                          ? 'grid-rows-[1fr]'
                          : 'grid-rows-[0fr]'
                      )}
                      aria-hidden={!showDictationBanner}
                    >
                      <div className='overflow-hidden'>
                        <div className='system-b-chat-composer-seam border-t'>
                          {dictationBanner}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className='system-b-chat-composer-seam border-t'>
                    <InputRow
                      containerRef={containerRef}
                      hiddenDivRef={hiddenDivRef}
                      internalTextareaRef={internalTextareaRef}
                      value={value}
                      onChange={handleChange}
                      handleKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder={placeholder}
                      isAtMaxHeight={isAtMaxHeight}
                      measuredHeight={measuredHeight}
                      reducedMotion={reducedMotion}
                      isNearLimit={isNearLimit}
                      hasAttachButton={hasAttachButton}
                      onFileAttach={onFileAttach}
                      isFileProcessing={isFileProcessing}
                      isLoading={isLoading}
                      isSubmitting={isSubmitting}
                      plusMenuOpen={plusMenuOpen}
                      setPlusMenuOpen={setPlusMenuOpen}
                      handlePreserveFocus={handlePreserveFocus}
                      isDictationSupported={isDictationSupported}
                      isListening={isListening}
                      handleMicPushStart={handleMicPushStart}
                      handleMicPushEnd={handleMicPushEnd}
                      handleMicToggle={handleMicToggle}
                      canSend={canSend}
                      isStreaming={isStreaming}
                      onSend={handleSendClick}
                      onStop={onStop}
                      setIsFocused={setIsFocused}
                      setComposerFocused={setComposerFocused}
                      chips={chips}
                      onRemoveChipAt={onRemoveChipAt}
                      isPickerOpen={isPickerOpen}
                      isRootPickerOpen={isRootPickerOpen}
                      pickerListId={pickerListId}
                      pickerActiveRowId={pickerActiveRowId}
                      attachDisabledForPicker={isPickerOpen}
                      isHero={isHero}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* STACKED entity mode: rail (full width) above optional preview, above input */}
                {showEntitySurface && isStacked ? (
                  <div className='flex flex-col'>
                    <div className='system-b-chat-composer-seam border-b'>
                      <SlashCommandMenu
                        profileId={pickerProfileId}
                        state={picker.state}
                        onSelectSkill={handleSelectSkill}
                        onSelectEntity={handleSelectEntity}
                        onSetSelected={picker.setSelected}
                        onMoveSelected={picker.moveSelected}
                        onClose={handlePickerClose}
                        variant='rail'
                        listIdProp={pickerListId}
                        onActiveRowChange={setPickerActiveRowId}
                      />
                    </div>
                    {activeEntity ? (
                      <div className='system-b-chat-composer-seam border-b'>
                        <EntityPreviewPane entity={activeEntity} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {statusBanner ? (
                  <div className='system-b-chat-composer-seam border-b'>
                    {statusBanner}
                  </div>
                ) : null}

                {/* Grid accordion reserves height while animating dictation
                    banner in/out — avoids the ~64px jump (JOV-11948). */}
                {isDictationSupported ? (
                  <div
                    className={cn(
                      'grid transition-[grid-template-rows] duration-subtle ease-in-out',
                      showDictationBanner
                        ? 'grid-rows-[1fr]'
                        : 'grid-rows-[0fr]'
                    )}
                    aria-hidden={!showDictationBanner}
                  >
                    <div className='overflow-hidden'>
                      <div className='system-b-chat-composer-seam border-b'>
                        {dictationBanner}
                      </div>
                    </div>
                  </div>
                ) : null}

                <InputRow
                  containerRef={containerRef}
                  hiddenDivRef={hiddenDivRef}
                  internalTextareaRef={internalTextareaRef}
                  value={value}
                  onChange={handleChange}
                  handleKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={placeholder}
                  isAtMaxHeight={isAtMaxHeight}
                  measuredHeight={measuredHeight}
                  reducedMotion={reducedMotion}
                  isNearLimit={isNearLimit}
                  hasAttachButton={hasAttachButton}
                  onFileAttach={onFileAttach}
                  isFileProcessing={isFileProcessing}
                  isLoading={isLoading}
                  isSubmitting={isSubmitting}
                  plusMenuOpen={plusMenuOpen}
                  setPlusMenuOpen={setPlusMenuOpen}
                  handlePreserveFocus={handlePreserveFocus}
                  isDictationSupported={isDictationSupported}
                  isListening={isListening}
                  handleMicPushStart={handleMicPushStart}
                  handleMicPushEnd={handleMicPushEnd}
                  handleMicToggle={handleMicToggle}
                  canSend={canSend}
                  isStreaming={isStreaming}
                  onSend={handleSendClick}
                  onStop={onStop}
                  setIsFocused={setIsFocused}
                  setComposerFocused={setComposerFocused}
                  chips={chips}
                  onRemoveChipAt={onRemoveChipAt}
                  hasBorderTop={
                    // Add a top separator only when there is surface content
                    // *inside* the surface above the InputRow (entity mode).
                    // The root picker is absolutely positioned outside the
                    // surface, so it does not need a separator or shift the
                    // composer vertically.
                    showEntitySurface
                  }
                  isPickerOpen={isPickerOpen}
                  isRootPickerOpen={isRootPickerOpen}
                  pickerListId={pickerListId}
                  pickerActiveRowId={pickerActiveRowId}
                  attachDisabledForPicker={isPickerOpen}
                  isHero={isHero}
                />
              </>
            )}
          </motion.div>
        </div>

        {isNearLimit ? (
          <output
            id='char-limit-status'
            aria-live='polite'
            className={cn(
              'mt-1 block text-center text-xs',
              isOverLimit ? 'text-error' : 'text-tertiary-token'
            )}
          >
            {isOverLimit
              ? `Message is ${characterCount - MAX_MESSAGE_LENGTH} characters over the limit (${characterCount}/${MAX_MESSAGE_LENGTH})`
              : `${characterCount}/${MAX_MESSAGE_LENGTH} characters`}
          </output>
        ) : null}
      </form>
    );
  }
);

interface InputRowProps {
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly hiddenDivRef: React.RefObject<HTMLDivElement | null>;
  readonly internalTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onPaste?: (e: React.ClipboardEvent) => void;
  readonly placeholder: string;
  readonly isAtMaxHeight: boolean;
  readonly measuredHeight: number;
  readonly reducedMotion: boolean | null;
  readonly isNearLimit: boolean;
  readonly hasAttachButton: boolean;
  readonly onFileAttach?: () => void;
  readonly isFileProcessing: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly plusMenuOpen: boolean;
  readonly setPlusMenuOpen: (open: boolean) => void;
  readonly handlePreserveFocus: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
  readonly isDictationSupported: boolean;
  readonly isListening: boolean;
  readonly handleMicPushStart: () => void;
  readonly handleMicPushEnd: () => void;
  readonly handleMicToggle: () => void;
  readonly canSend: boolean;
  readonly isStreaming: boolean;
  readonly onSend: () => void;
  readonly onStop?: () => void;
  readonly setIsFocused: (focused: boolean) => void;
  readonly setComposerFocused: (focused: boolean) => void;
  readonly chips?: readonly import('../hooks/useChipTray').TrayChip[];
  readonly onRemoveChipAt?: (index: number) => void;
  /** Add hairline divider above the input (when picker sits above it). */
  readonly hasBorderTop?: boolean;
  /** True while slash picker is open — drives textarea combobox ARIA. */
  readonly isPickerOpen: boolean;
  /** True while the root slash picker is floating above the composer. */
  readonly isRootPickerOpen: boolean;
  /** id of the listbox the textarea controls (always set for stable ARIA). */
  readonly pickerListId: string;
  /** Active row id for `aria-activedescendant`; null when no row is active. */
  readonly pickerActiveRowId: string | null;
  /** Disable the attach dropdown trigger while the picker owns the keyboard. */
  readonly attachDisabledForPicker: boolean;
  readonly isHero: boolean;
}

function InputRow({
  containerRef,
  hiddenDivRef,
  internalTextareaRef,
  value,
  onChange,
  handleKeyDown,
  onPaste,
  placeholder,
  isAtMaxHeight,
  measuredHeight,
  reducedMotion,
  isNearLimit,
  hasAttachButton,
  onFileAttach,
  isFileProcessing,
  isLoading,
  isSubmitting,
  plusMenuOpen,
  setPlusMenuOpen,
  handlePreserveFocus,
  isDictationSupported,
  isListening,
  handleMicPushStart,
  handleMicPushEnd,
  handleMicToggle,
  canSend,
  isStreaming,
  onSend,
  onStop,
  setIsFocused,
  setComposerFocused,
  chips,
  onRemoveChipAt,
  hasBorderTop = false,
  isPickerOpen,
  isRootPickerOpen,
  pickerListId,
  pickerActiveRowId,
  attachDisabledForPicker,
  isHero,
}: InputRowProps) {
  const hasInlineContent = Boolean(value.trim()) || (chips?.length ?? 0) > 0;
  const hasOnlyRootSlashQuery =
    isRootPickerOpen &&
    value.trim().startsWith('/') &&
    (chips?.length ?? 0) === 0;
  const useHeroPill = isHero && (!hasInlineContent || hasOnlyRootSlashQuery);

  return (
    <div className={cn(hasBorderTop && 'system-b-chat-composer-seam border-t')}>
      <motion.div
        data-testid='chat-composer-input-row'
        layout={!reducedMotion}
        ref={containerRef}
        transition={reducedMotion ? undefined : TRANSITION_SURFACE}
        className={cn(
          'relative',
          useHeroPill
            ? 'flex min-h-13 items-center gap-1.5 px-3 py-1.5 sm:min-h-14 sm:px-3'
            : 'grid content-start gap-2 grid-rows-[auto_36px] px-3 py-1.5'
        )}
      >
        <div ref={hiddenDivRef} style={HIDDEN_DIV_STYLES} aria-hidden />
        {useHeroPill && hasAttachButton ? (
          <ComposerAttachButton
            isFileProcessing={isFileProcessing}
            isLoading={isLoading}
            isSubmitting={isSubmitting}
            disabled={attachDisabledForPicker}
            plusMenuOpen={plusMenuOpen}
            onOpenChange={setPlusMenuOpen}
            onMouseDown={handlePreserveFocus}
            onFileAttach={onFileAttach ?? (() => undefined)}
          />
        ) : null}
        <div
          data-testid='chat-input-inline-field'
          className={cn(
            'flex w-full min-w-0 flex-wrap items-start gap-x-1.5 gap-y-1.5',
            useHeroPill
              ? 'min-h-8 flex-1 items-center px-1.5 pt-0'
              : isHero
                ? 'px-2 pt-0.5'
                : 'px-1.5 pt-0'
          )}
        >
          {chips && chips.length > 0 && onRemoveChipAt ? (
            <ChipTray chips={chips} onRemoveAt={onRemoveChipAt} />
          ) : null}

          <motion.textarea
            ref={internalTextareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            animate={reducedMotion ? undefined : { height: measuredHeight }}
            transition={reducedMotion ? undefined : SPRING_HEIGHT}
            className={cn(
              'system-b-chat-composer-input min-w-[min(13rem,100%)] flex-1 resize-none bg-transparent placeholder:text-quaternary-token',
              isHero
                ? 'min-h-7 px-2 py-0.5 text-mid font-book leading-6 text-primary-token sm:text-base'
                : 'min-h-6 px-1.5 py-px text-mid leading-6 text-primary-token',
              // Remove the browser's default focus outline. The surrounding
              // surface provides the focus affordance (border glow via
              // isFocused→isExpanded). Using focus-visible:outline-none keeps
              // the suppress intentional for both mouse and keyboard paths since
              // the surface-level glow IS the keyboard focus indicator for this
              // compound widget.
              'focus:outline-none! focus-visible:outline-none! focus-visible:ring-0! focus-visible:ring-0!',
              'focus:shadow-none! focus-visible:shadow-none! shadow-none [outline:none]',
              isAtMaxHeight ? 'overflow-y-auto' : 'overflow-hidden'
            )}
            style={{
              ...(reducedMotion ? { height: measuredHeight } : null),
              boxShadow: 'none',
              outline: 'none',
            }}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            onFocus={() => {
              setIsFocused(true);
              setComposerFocused(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              setComposerFocused(false);
            }}
            maxLength={MAX_MESSAGE_LENGTH + 100}
            aria-label='Chat Message Input'
            aria-describedby={isNearLimit ? 'char-limit-status' : undefined}
            // WAI-ARIA combobox pattern: the textarea is the input that
            // controls the listbox rendered by SlashCommandMenu. Focus stays
            // on the textarea; selection is communicated via
            // aria-activedescendant pointing to the row id.
            role={isPickerOpen ? 'combobox' : undefined}
            aria-expanded={isPickerOpen ? 'true' : undefined}
            aria-controls={isPickerOpen ? pickerListId : undefined}
            aria-activedescendant={
              isPickerOpen && pickerActiveRowId ? pickerActiveRowId : undefined
            }
            aria-autocomplete={isPickerOpen ? 'list' : undefined}
          />
        </div>

        <div
          className={cn(
            'flex items-center gap-2',
            useHeroPill
              ? 'min-h-9 shrink-0 justify-end'
              : ['justify-between', 'min-h-9']
          )}
        >
          <div className='flex min-w-0 items-center gap-2'>
            {!useHeroPill && hasAttachButton ? (
              <ComposerAttachButton
                isFileProcessing={isFileProcessing}
                isLoading={isLoading}
                isSubmitting={isSubmitting}
                disabled={attachDisabledForPicker}
                plusMenuOpen={plusMenuOpen}
                onOpenChange={setPlusMenuOpen}
                onMouseDown={handlePreserveFocus}
                onFileAttach={onFileAttach ?? (() => undefined)}
              />
            ) : null}
          </div>

          <div className='flex shrink-0 items-center gap-2'>
            <ComposerMicButton
              isListening={isListening}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              isSupported={isDictationSupported}
              onPreserveFocus={handlePreserveFocus}
              onPushStart={handleMicPushStart}
              onPushEnd={handleMicPushEnd}
              onToggle={handleMicToggle}
            />

            <ComposerSendButton
              canSend={canSend}
              isStreaming={isStreaming}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              reducedMotion={reducedMotion}
              onMouseDown={handlePreserveFocus}
              onSend={onSend}
              onStop={onStop}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
