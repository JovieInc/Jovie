'use client';

import { motion, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import type { PendingImage } from '../hooks/useChatImageAttachments';
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
import { ImagePreviewStrip } from './ImagePreviewStrip';
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
  readonly onImageAttach?: () => void;
  readonly isImageProcessing?: boolean;
  readonly pendingImages?: PendingImage[];
  readonly onRemoveImage?: (id: string) => void;
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
  /** Enables the Shell + Chat V1 composer geometry behind DESIGN_V1. */
  readonly shellChatV1?: boolean;
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
  variant: NonNullable<ChatInputProps['variant']>
): SurfaceGeometry {
  const width = '100%';
  const isHero = variant === 'hero';
  const maxWidth = isHero
    ? 'min(calc(100vw - 32px), 840px)'
    : 'min(calc(100vw - 32px), 720px)';
  if (stacked) return { width, maxWidth, borderRadius: 28 };
  if (isHero && mode !== 'entity') return { width, maxWidth, borderRadius: 36 };
  if (mode === 'entity') return { width, maxWidth, borderRadius: 24 };
  return { width, maxWidth, borderRadius: 28 };
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

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput(
    {
      value,
      onChange,
      onSubmit,
      isLoading,
      isSubmitting,
      placeholder = 'Ask Jovie anything',
      variant = 'default',
      onImageAttach,
      isImageProcessing = false,
      pendingImages,
      onRemoveImage,
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
      shellChatV1 = false,
      statusBanner,
    },
    ref
  ) {
    const reducedMotion = useReducedMotion();
    const characterCount = value.length;
    const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.9;
    const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;
    const hasAttachButton = Boolean(onImageAttach);
    const hasPendingImages = (pendingImages?.length ?? 0) > 0;
    const hasChips = (chips?.length ?? 0) > 0;

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
    const { items: pickerItems, sections: _sections } = useSlashItems(
      picker.state,
      pickerProfileId
    );
    const activeEntity = activeEntityFor(picker.state, pickerItems);
    const isPickerOpen = picker.state.status !== 'closed';
    // Treat a lone leading "/" as picker bait, not a real message — the picker
    // is open above it and Enter is committing the active row, not sending.
    const sendBlockedByPicker = isPickerOpen && value.trim() === '/';
    const canSend =
      Boolean(value.trim() || hasPendingImages || hasChips) &&
      !isLoading &&
      !isSubmitting &&
      !isOverLimit &&
      !isImageProcessing &&
      !sendBlockedByPicker;

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
            picker.openRoot(trigger.startIdx, trigger.query);
          } else {
            // entity mode: only update query (kind stays locked)
            picker.setQuery(trigger.query);
          }
        } else if (picker.state.status === 'root') {
          picker.close();
        }
      },
      [onChange, picker]
    );

    const stripSlashQuery = useCallback(() => {
      if (picker.state.status === 'closed') return;
      const startIdx = picker.state.startIdx;
      const el = internalTextareaRef.current;
      const caret = el?.selectionStart ?? value.length;
      const nextValue = value.slice(0, startIdx) + value.slice(caret);
      onChange(nextValue);
    }, [onChange, picker.state, value]);

    const handleSelectSkill = useCallback(
      (skill: import('@/lib/commands/registry').SkillCommand) => {
        onAddSkill?.(skill.id);
        stripSlashQuery();
        const requiredSlot = skill.entitySlots.find(s => s.required);
        if (requiredSlot && picker.state.status !== 'closed') {
          picker.openEntity(requiredSlot.kind, picker.state.startIdx, '');
        } else {
          picker.close();
        }
      },
      [onAddSkill, stripSlashQuery, picker]
    );

    const handleSelectEntity = useCallback(
      (entity: import('@/lib/commands/entities').EntityRef) => {
        onAddEntity?.({
          kind: entity.kind,
          id: entity.id,
          label: entity.label,
        });
        stripSlashQuery();
        picker.close();
      },
      [onAddEntity, stripSlashQuery, picker]
    );

    const handleSelectPromptAction = useCallback(
      (prompt: string) => {
        stripSlashQuery();
        picker.close();
        onQuickActionSelect?.(prompt);
      },
      [onQuickActionSelect, picker, stripSlashQuery]
    );

    const {
      isSupported: isDictationSupported,
      isListening,
      toggle: toggleDictation,
    } = useSpeechRecognition({
      onTranscript: sessionTranscript => {
        onChange(dictationBaselineRef.current + sessionTranscript);
      },
    });

    const handleMicToggle = useCallback(() => {
      if (!isListening) {
        dictationBaselineRef.current = value;
      }
      toggleDictation();
    }, [isListening, toggleDictation, value]);

    const handleFormSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(e);
      },
      [onSubmit]
    );

    const handleSendClick = useCallback(() => {
      onSubmit();
    }, [onSubmit]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        // While the picker is open, swallow Enter — SlashCommandMenu owns it.
        if (picker.state.status !== 'closed' && e.key === 'Enter') return;
        if (e.key === 'Enter' && !e.shiftKey && canSend) {
          e.preventDefault();
          onSubmit();
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
      [onSubmit, canSend, value, chips, onRemoveLastChip, picker.state]
    );

    const handlePreserveFocus = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
      },
      []
    );

    // Resolve the surface mode from textarea + picker state. Shell + Chat V1
    // keeps focus-only empty pills calm; the legacy shell preserves the old
    // focus-to-typing morph until the rollout flag is enabled.
    const hasText = Boolean(value.trim()) || hasPendingImages;
    const isExpanded = plusMenuOpen || isListening || hasText || isFocused;
    let surfaceMode: SurfaceMode = 'empty';
    if (picker.state.status === 'entity') surfaceMode = 'entity';
    else if (picker.state.status === 'root') surfaceMode = 'root';
    else if (
      hasText ||
      plusMenuOpen ||
      isListening ||
      (!shellChatV1 && isFocused)
    )
      surfaceMode = 'typing';

    const geometry = geometryFor(surfaceMode, isStacked, variant);
    const showInlinePicker = picker.state.status === 'root';
    const showEntitySurface = picker.state.status === 'entity';
    const dockClass =
      surfaceMode === 'entity' && !isStacked
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

    useEffect(() => {
      onPickerOpenChange?.(picker.state.status !== 'closed');
    }, [picker.state.status, onPickerOpenChange]);

    return (
      <form
        onSubmit={handleFormSubmit}
        aria-label='Compose a message — type / for skills and references'
        className='relative z-10 w-full focus-within:outline-none'
      >
        <div className={dockClass}>
          {/* ROOT inline picker is absolutely positioned so it does not alter
              the composer surface height and cause layout shift when it opens. */}
          {showInlinePicker ? (
            <div className='absolute bottom-full left-0 right-0 z-50 mb-4 flex justify-center'>
              <div
                style={{
                  width: geometry.width,
                  maxWidth: geometry.maxWidth,
                }}
                className='overflow-hidden rounded-[24px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_84%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.012)_100%),var(--linear-app-content-surface)] shadow-none'
              >
                <SlashCommandMenu
                  profileId={pickerProfileId}
                  state={picker.state}
                  onSelectSkill={handleSelectSkill}
                  onSelectEntity={handleSelectEntity}
                  onSetSelected={picker.setSelected}
                  onMoveSelected={picker.moveSelected}
                  onClose={picker.close}
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
              'overflow-hidden border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_84%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.012)_100%),var(--linear-app-content-surface)] text-primary-token shadow-none',
              isHero &&
                'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_88%,black_12%)] shadow-[0_18px_68px_-34px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.08)]',
              isExpanded &&
                'border-[color-mix(in_oklab,var(--linear-border-focus)_46%,var(--linear-app-frame-seam))] bg-[linear-gradient(180deg,rgba(255,255,255,0.052)_0%,rgba(255,255,255,0.016)_100%),var(--linear-app-content-surface)]',
              isHero &&
                isExpanded &&
                'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_82%,white_6%)]',
              'outline-none ring-0 focus-within:border-[color-mix(in_oklab,var(--linear-border-focus)_78%,transparent)] focus-within:ring-1 focus-within:ring-[color-mix(in_oklab,var(--linear-border-focus)_42%,transparent)] focus-within:outline-none',
              isOverLimit && 'border-error',
              showEntitySurface && !isStacked ? 'flex' : 'flex flex-col'
            )}
          >
            {showEntitySurface && !isStacked ? (
              <div className='flex w-full'>
                <aside className='flex w-[264px] shrink-0 flex-col border-r border-white/[0.065]'>
                  <SlashCommandMenu
                    profileId={pickerProfileId}
                    state={picker.state}
                    onSelectSkill={handleSelectSkill}
                    onSelectEntity={handleSelectEntity}
                    onSetSelected={picker.setSelected}
                    onMoveSelected={picker.moveSelected}
                    onClose={picker.close}
                    variant='rail'
                    listIdProp={pickerListId}
                    onActiveRowChange={setPickerActiveRowId}
                  />
                </aside>
                <div className='flex min-w-0 flex-1 flex-col'>
                  {activeEntity ? (
                    <EntityPreviewPane entity={activeEntity} />
                  ) : (
                    <div className='flex-1 px-6 py-[22px] text-[12px] text-tertiary-token'>
                      Pick {pickerKindArticle(picker.state.kind)}{' '}
                      {pickerKindNoun(picker.state.kind)} to preview.
                    </div>
                  )}
                  {statusBanner ? (
                    <div className='border-t border-white/[0.065]'>
                      {statusBanner}
                    </div>
                  ) : null}
                  <div className='border-t border-white/[0.065]'>
                    <InputRow
                      containerRef={containerRef}
                      hiddenDivRef={hiddenDivRef}
                      internalTextareaRef={internalTextareaRef}
                      value={value}
                      onChange={handleChange}
                      handleKeyDown={handleKeyDown}
                      onPaste={onPaste}
                      placeholder={placeholder}
                      isAtMaxHeight={isAtMaxHeight}
                      measuredHeight={measuredHeight}
                      reducedMotion={reducedMotion}
                      isNearLimit={isNearLimit}
                      hasAttachButton={hasAttachButton}
                      onImageAttach={onImageAttach}
                      isImageProcessing={isImageProcessing}
                      isLoading={isLoading}
                      isSubmitting={isSubmitting}
                      plusMenuOpen={plusMenuOpen}
                      setPlusMenuOpen={setPlusMenuOpen}
                      handlePreserveFocus={handlePreserveFocus}
                      isDictationSupported={isDictationSupported}
                      isListening={isListening}
                      handleMicToggle={handleMicToggle}
                      canSend={canSend}
                      isStreaming={isStreaming}
                      onSend={handleSendClick}
                      onStop={onStop}
                      setIsFocused={setIsFocused}
                      hasPendingImages={hasPendingImages}
                      pendingImages={pendingImages}
                      onRemoveImage={onRemoveImage}
                      chips={chips}
                      onRemoveChipAt={onRemoveChipAt}
                      isPickerOpen={isPickerOpen}
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
                    <div className='border-b border-white/[0.065]'>
                      <SlashCommandMenu
                        profileId={pickerProfileId}
                        state={picker.state}
                        onSelectSkill={handleSelectSkill}
                        onSelectEntity={handleSelectEntity}
                        onSetSelected={picker.setSelected}
                        onMoveSelected={picker.moveSelected}
                        onClose={picker.close}
                        variant='rail'
                        listIdProp={pickerListId}
                        onActiveRowChange={setPickerActiveRowId}
                      />
                    </div>
                    {activeEntity ? (
                      <div className='border-b border-white/[0.065]'>
                        <EntityPreviewPane entity={activeEntity} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {statusBanner ? (
                  <div className='border-b border-white/[0.065]'>
                    {statusBanner}
                  </div>
                ) : null}

                <InputRow
                  containerRef={containerRef}
                  hiddenDivRef={hiddenDivRef}
                  internalTextareaRef={internalTextareaRef}
                  value={value}
                  onChange={handleChange}
                  handleKeyDown={handleKeyDown}
                  onPaste={onPaste}
                  placeholder={placeholder}
                  isAtMaxHeight={isAtMaxHeight}
                  measuredHeight={measuredHeight}
                  reducedMotion={reducedMotion}
                  isNearLimit={isNearLimit}
                  hasAttachButton={hasAttachButton}
                  onImageAttach={onImageAttach}
                  isImageProcessing={isImageProcessing}
                  isLoading={isLoading}
                  isSubmitting={isSubmitting}
                  plusMenuOpen={plusMenuOpen}
                  setPlusMenuOpen={setPlusMenuOpen}
                  handlePreserveFocus={handlePreserveFocus}
                  isDictationSupported={isDictationSupported}
                  isListening={isListening}
                  handleMicToggle={handleMicToggle}
                  canSend={canSend}
                  isStreaming={isStreaming}
                  onSend={handleSendClick}
                  onStop={onStop}
                  setIsFocused={setIsFocused}
                  hasPendingImages={hasPendingImages}
                  pendingImages={pendingImages}
                  onRemoveImage={onRemoveImage}
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
  readonly onImageAttach?: () => void;
  readonly isImageProcessing: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly plusMenuOpen: boolean;
  readonly setPlusMenuOpen: (open: boolean) => void;
  readonly handlePreserveFocus: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
  readonly isDictationSupported: boolean;
  readonly isListening: boolean;
  readonly handleMicToggle: () => void;
  readonly canSend: boolean;
  readonly isStreaming: boolean;
  readonly onSend: () => void;
  readonly onStop?: () => void;
  readonly setIsFocused: (focused: boolean) => void;
  readonly hasPendingImages: boolean;
  readonly pendingImages?: import('../hooks/useChatImageAttachments').PendingImage[];
  readonly onRemoveImage?: (id: string) => void;
  readonly chips?: readonly import('../hooks/useChipTray').TrayChip[];
  readonly onRemoveChipAt?: (index: number) => void;
  /** Add hairline divider above the input (when picker sits above it). */
  readonly hasBorderTop?: boolean;
  /** True while slash picker is open — drives textarea combobox ARIA. */
  readonly isPickerOpen: boolean;
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
  onImageAttach,
  isImageProcessing,
  isLoading,
  isSubmitting,
  plusMenuOpen,
  setPlusMenuOpen,
  handlePreserveFocus,
  isDictationSupported,
  isListening,
  handleMicToggle,
  canSend,
  isStreaming,
  onSend,
  onStop,
  setIsFocused,
  hasPendingImages,
  pendingImages,
  onRemoveImage,
  chips,
  onRemoveChipAt,
  hasBorderTop = false,
  isPickerOpen,
  pickerListId,
  pickerActiveRowId,
  attachDisabledForPicker,
  isHero,
}: InputRowProps) {
  const useHeroPill = isHero && !hasPendingImages;

  return (
    <div className={cn(hasBorderTop && 'border-t border-white/[0.065]')}>
      {hasPendingImages && onRemoveImage ? (
        <div className='px-3 pt-3'>
          <ImagePreviewStrip
            images={pendingImages ?? []}
            onRemove={onRemoveImage}
          />
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          'relative',
          useHeroPill
            ? 'flex min-h-[52px] items-center gap-1.5 px-3 py-1.5 sm:min-h-[56px] sm:px-3'
            : [
                'grid gap-2',
                isHero
                  ? 'min-h-[64px] grid-rows-[minmax(28px,auto)_36px] px-3 py-1.5'
                  : 'min-h-[56px] grid-rows-[minmax(24px,auto)_36px] px-3 py-1.5',
              ]
        )}
      >
        <div ref={hiddenDivRef} style={HIDDEN_DIV_STYLES} aria-hidden />
        {useHeroPill && hasAttachButton && onImageAttach ? (
          <ComposerAttachButton
            isImageProcessing={isImageProcessing}
            isLoading={isLoading}
            isSubmitting={isSubmitting}
            disabled={attachDisabledForPicker}
            plusMenuOpen={plusMenuOpen}
            onOpenChange={setPlusMenuOpen}
            onMouseDown={handlePreserveFocus}
            onImageAttach={onImageAttach}
          />
        ) : null}
        <div
          data-testid='chat-input-inline-field'
          className={cn(
            'flex w-full min-w-0 flex-wrap items-start gap-x-1.5 gap-y-1.5',
            useHeroPill
              ? 'min-h-8 flex-1 items-center px-1.5 pt-0'
              : isHero
                ? 'min-h-7 px-2 pt-0.5'
                : 'min-h-6 px-1.5 pt-0'
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
              'min-w-[min(13rem,100%)] flex-[1_1_13rem] resize-none bg-transparent placeholder:text-quaternary-token',
              isHero
                ? 'min-h-7 px-2 py-0.5 text-[15px] font-[450] leading-6 text-primary-token sm:text-[16px]'
                : 'min-h-6 px-1.5 py-[1px] text-[15px] leading-6 text-white/92',
              // Remove the browser's default focus outline. The surrounding
              // surface provides the focus affordance (border glow via
              // isFocused→isExpanded). Using focus-visible:outline-none keeps
              // the suppress intentional for both mouse and keyboard paths since
              // the surface-level glow IS the keyboard focus indicator for this
              // compound widget.
              'focus:outline-none! focus-visible:outline-none! focus:ring-0! focus-visible:ring-0!',
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            maxLength={MAX_MESSAGE_LENGTH + 100}
            aria-label='Chat message input'
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
              ? 'min-h-8 shrink-0 justify-end'
              : ['justify-between', 'min-h-9']
          )}
        >
          <div className='flex min-w-0 items-center gap-2'>
            {!useHeroPill && hasAttachButton && onImageAttach ? (
              <ComposerAttachButton
                isImageProcessing={isImageProcessing}
                isLoading={isLoading}
                isSubmitting={isSubmitting}
                disabled={attachDisabledForPicker}
                plusMenuOpen={plusMenuOpen}
                onOpenChange={setPlusMenuOpen}
                onMouseDown={handlePreserveFocus}
                onImageAttach={onImageAttach}
              />
            ) : null}
          </div>

          <div className='flex shrink-0 items-center gap-2'>
            <ComposerMicButton
              isListening={isListening}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              isSupported={isDictationSupported}
              onMouseDown={handlePreserveFocus}
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
      </div>
    </div>
  );
}
