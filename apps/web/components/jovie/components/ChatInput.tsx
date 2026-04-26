'use client';

import { motion, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  useCallback,
  useEffect,
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
import {
  SPRING_HEIGHT,
  TRANSITION_REVEAL,
  TRANSITION_SURFACE,
} from './chat-motion';
import {
  CHAT_PROMPT_RAIL_CLASS,
  CHAT_PROMPT_RAIL_MASK_STYLE,
  CHAT_PROMPT_RAIL_SCROLL_CLASS,
  getChatPromptPillClass,
} from './chat-prompt-styles';
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
  readonly variant?: 'default' | 'compact';
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
}

type SurfaceMode = 'empty' | 'typing' | 'root' | 'entity';

interface SurfaceGeometry {
  readonly width: number | string;
  readonly maxWidth: number | string;
  readonly borderRadius: number;
}

function geometryFor(mode: SurfaceMode, stacked: boolean): SurfaceGeometry {
  if (stacked) {
    if (mode === 'empty')
      return { width: '100%', maxWidth: '100%', borderRadius: 999 };
    return { width: '100%', maxWidth: '100%', borderRadius: 18 };
  }
  if (mode === 'empty') return { width: 440, maxWidth: 440, borderRadius: 999 };
  if (mode === 'typing') return { width: 440, maxWidth: 440, borderRadius: 24 };
  if (mode === 'root') return { width: 520, maxWidth: 520, borderRadius: 20 };
  return { width: 760, maxWidth: '100%', borderRadius: 20 };
}

const SURFACE_BG =
  'linear-gradient(180deg, rgba(255,255,255,0.018) 0%, transparent 40%), #16161a';

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
    },
    ref
  ) {
    const reducedMotion = useReducedMotion();
    const characterCount = value.length;
    const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.9;
    const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;
    const hasAttachButton = Boolean(onImageAttach);
    const hasPendingImages = (pendingImages?.length ?? 0) > 0;
    const canSend =
      Boolean(value.trim() || hasPendingImages) &&
      !isLoading &&
      !isSubmitting &&
      !isOverLimit &&
      !isImageProcessing;

    const [plusMenuOpen, setPlusMenuOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isViewportNarrow, setIsViewportNarrow] = useState(false);

    // Variant F's "compact" rule fires below ~900px viewport (or any time the
    // composer was already rendered in the compact follow-up variant). At that
    // size the entity surface stacks rail-on-top instead of two columns.
    useEffect(() => {
      if (typeof globalThis.window === 'undefined') return;
      const mq = globalThis.matchMedia('(max-width: 899px)');
      const update = () => setIsViewportNarrow(mq.matches);
      update();
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }, []);

    const isCompact = variant === 'compact';
    const isStacked = isCompact || isViewportNarrow;
    const maxHeight = isCompact ? 128 : 192;
    const minHeight = 28;

    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => internalTextareaRef.current!, []);

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

    // Slash trigger detection: open root picker when `/` follows a word
    // boundary; switch to entity picker when a skill commit demands it.
    const handleChange = useCallback(
      (next: string) => {
        onChange(next);
        const el = internalTextareaRef.current;
        const caret = el?.selectionStart ?? next.length;
        const trigger = detectSlashTriggerAt(next, caret);
        if (trigger) {
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

    const {
      isSupported: hasDictation,
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

    // Resolve the surface mode from textarea + picker state.
    const hasText = Boolean(value.trim()) || hasPendingImages;
    const isExpanded = isFocused || plusMenuOpen || isListening || hasText;
    let surfaceMode: SurfaceMode = 'empty';
    if (picker.state.status === 'entity') surfaceMode = 'entity';
    else if (picker.state.status === 'root') surfaceMode = 'root';
    else if (hasText || isFocused) surfaceMode = 'typing';

    const geometry = geometryFor(surfaceMode, isStacked);
    const showInlinePicker = picker.state.status === 'root' && !isStacked;
    const showEntitySurface = picker.state.status === 'entity';
    const dockClass =
      surfaceMode === 'entity' && !isStacked
        ? 'flex justify-end'
        : 'flex justify-center';

    const hasQuickActions =
      Boolean(onQuickActionSelect) && (quickActions?.length ?? 0) > 0;

    // Container the slash key listener cares about when the picker is closed.
    // (The active-listener inside SlashCommandMenu only mounts while open.)

    // Refocus textarea when the picker closes so typing can continue.
    useEffect(() => {
      if (picker.state.status === 'closed' && isFocused) {
        internalTextareaRef.current?.focus();
      }
    }, [picker.state.status, isFocused]);

    useEffect(() => {
      onPickerOpenChange?.(picker.state.status !== 'closed');
    }, [picker.state.status, onPickerOpenChange]);

    return (
      <form onSubmit={handleFormSubmit}>
        <div className={dockClass}>
          <motion.div
            data-testid='chat-composer-surface'
            data-surface-mode={surfaceMode}
            data-compact={isCompact ? 'true' : 'false'}
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
              background: SURFACE_BG,
              borderRadius: geometry.borderRadius,
              width: geometry.width,
              maxWidth: geometry.maxWidth,
            }}
            className={cn(
              'overflow-hidden border border-white/[0.10] shadow-[0_1px_0_rgba(255,255,255,0.045)_inset,0_0_0_0.5px_rgba(255,255,255,0.02),0_1px_2px_rgba(0,0,0,0.3),0_6px_16px_-6px_rgba(0,0,0,0.45)]',
              isExpanded &&
                'shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_0_0_0.5px_rgba(255,255,255,0.04),0_2px_4px_rgba(0,0,0,0.35),0_24px_56px_-20px_rgba(0,0,0,0.55)] border-white/[0.14]',
              isOverLimit && 'border-error',
              showEntitySurface && !isStacked ? 'flex' : 'flex flex-col'
            )}
          >
            {showEntitySurface && !isStacked ? (
              <div className='flex w-full'>
                <aside className='flex w-[264px] shrink-0 flex-col border-r border-white/[0.055]'>
                  <SlashCommandMenu
                    profileId={pickerProfileId}
                    state={picker.state}
                    onSelectSkill={handleSelectSkill}
                    onSelectEntity={handleSelectEntity}
                    onSetSelected={picker.setSelected}
                    onMoveSelected={picker.moveSelected}
                    onClose={picker.close}
                    variant='rail'
                  />
                </aside>
                <div className='flex min-w-0 flex-1 flex-col'>
                  {activeEntity ? (
                    <EntityPreviewPane entity={activeEntity} />
                  ) : (
                    <div className='flex-1 px-6 py-[22px] text-[12px] text-tertiary-token'>
                      Pick a{' '}
                      {picker.state.kind === 'release'
                        ? 'release'
                        : 'reference'}{' '}
                      to preview.
                    </div>
                  )}
                  <div className='border-t border-white/[0.055]'>
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
                      hasDictation={hasDictation}
                      isListening={isListening}
                      handleMicToggle={handleMicToggle}
                      canSend={canSend}
                      isStreaming={isStreaming}
                      isCompact={isCompact}
                      onStop={onStop}
                      setIsFocused={setIsFocused}
                      hasPendingImages={hasPendingImages}
                      pendingImages={pendingImages}
                      onRemoveImage={onRemoveImage}
                      chips={chips}
                      onRemoveChipAt={onRemoveChipAt}
                      isPillMode={false}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* STACKED entity mode: rail (full width) above optional preview, above input */}
                {showEntitySurface && isStacked ? (
                  <div className='flex flex-col'>
                    <div className='border-b border-white/[0.055]'>
                      <SlashCommandMenu
                        profileId={pickerProfileId}
                        state={picker.state}
                        onSelectSkill={handleSelectSkill}
                        onSelectEntity={handleSelectEntity}
                        onSetSelected={picker.setSelected}
                        onMoveSelected={picker.moveSelected}
                        onClose={picker.close}
                        variant='rail'
                      />
                    </div>
                    {activeEntity ? (
                      <div className='border-b border-white/[0.055]'>
                        <EntityPreviewPane entity={activeEntity} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* ROOT inline picker (above input) */}
                {showInlinePicker ? (
                  <SlashCommandMenu
                    profileId={pickerProfileId}
                    state={picker.state}
                    onSelectSkill={handleSelectSkill}
                    onSelectEntity={handleSelectEntity}
                    onSetSelected={picker.setSelected}
                    onMoveSelected={picker.moveSelected}
                    onClose={picker.close}
                    variant='inline'
                  />
                ) : null}

                {/* STACKED root picker (also stacks above input) */}
                {picker.state.status === 'root' && isStacked ? (
                  <div className='border-b border-white/[0.055]'>
                    <SlashCommandMenu
                      profileId={pickerProfileId}
                      state={picker.state}
                      onSelectSkill={handleSelectSkill}
                      onSelectEntity={handleSelectEntity}
                      onSetSelected={picker.setSelected}
                      onMoveSelected={picker.moveSelected}
                      onClose={picker.close}
                      variant='rail'
                    />
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
                  hasDictation={hasDictation}
                  isListening={isListening}
                  handleMicToggle={handleMicToggle}
                  canSend={canSend}
                  isStreaming={isStreaming}
                  isCompact={isCompact}
                  onStop={onStop}
                  setIsFocused={setIsFocused}
                  hasPendingImages={hasPendingImages}
                  pendingImages={pendingImages}
                  onRemoveImage={onRemoveImage}
                  chips={chips}
                  onRemoveChipAt={onRemoveChipAt}
                  isPillMode={surfaceMode === 'empty'}
                  hasBorderTop={picker.state.status !== 'closed'}
                />
              </>
            )}
          </motion.div>
        </div>

        {hasQuickActions && quickActions && surfaceMode === 'typing' ? (
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? undefined : TRANSITION_REVEAL}
            className='mt-2 flex justify-center'
          >
            <div
              className={CHAT_PROMPT_RAIL_SCROLL_CLASS}
              style={CHAT_PROMPT_RAIL_MASK_STYLE}
              data-testid='chat-input-quick-actions'
            >
              <div className={CHAT_PROMPT_RAIL_CLASS}>
                {quickActions.map(action => (
                  <button
                    key={action.label}
                    type='button'
                    onMouseDown={handlePreserveFocus}
                    onClick={() => onQuickActionSelect?.(action.prompt)}
                    className={cn(
                      getChatPromptPillClass('compact'),
                      'min-w-[124px] max-w-[172px]'
                    )}
                  >
                    <span className='truncate'>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}

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
  readonly hasDictation: boolean;
  readonly isListening: boolean;
  readonly handleMicToggle: () => void;
  readonly canSend: boolean;
  readonly isStreaming: boolean;
  readonly isCompact: boolean;
  readonly onStop?: () => void;
  readonly setIsFocused: (focused: boolean) => void;
  readonly hasPendingImages: boolean;
  readonly pendingImages?: import('../hooks/useChatImageAttachments').PendingImage[];
  readonly onRemoveImage?: (id: string) => void;
  readonly chips?: readonly import('../hooks/useChipTray').TrayChip[];
  readonly onRemoveChipAt?: (index: number) => void;
  /** Empty state: pill-shape, single-line clipped, vertical-center icons. */
  readonly isPillMode?: boolean;
  /** Add hairline divider above the input (when picker sits above it). */
  readonly hasBorderTop?: boolean;
}

function textareaAnimateProp(
  reducedMotion: boolean | null,
  isPillMode: boolean,
  measuredHeight: number
): { height: number } | undefined {
  if (reducedMotion || isPillMode) return undefined;
  return { height: measuredHeight };
}

function textareaStyleProp(
  reducedMotion: boolean | null,
  isPillMode: boolean,
  isAtMaxHeight: boolean,
  measuredHeight: number
): React.CSSProperties {
  const overflow = isAtMaxHeight ? 'auto' : 'hidden';
  if (!reducedMotion) return { overflow };
  return {
    height: isPillMode ? undefined : measuredHeight,
    overflow,
  };
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
  hasDictation,
  isListening,
  handleMicToggle,
  canSend,
  isStreaming,
  isCompact,
  onStop,
  setIsFocused,
  hasPendingImages,
  pendingImages,
  onRemoveImage,
  chips,
  onRemoveChipAt,
  isPillMode = false,
  hasBorderTop = false,
}: InputRowProps) {
  return (
    <div className={cn(hasBorderTop && 'border-t border-white/[0.055]')}>
      {hasPendingImages && onRemoveImage ? (
        <div className='px-4 pt-3'>
          <ImagePreviewStrip
            images={pendingImages ?? []}
            onRemove={onRemoveImage}
          />
        </div>
      ) : null}

      {chips && chips.length > 0 && onRemoveChipAt ? (
        <div className='px-4 pt-3'>
          <ChipTray chips={chips} onRemoveAt={onRemoveChipAt} />
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          'relative flex gap-1',
          isPillMode
            ? 'items-center px-[7px] py-[7px] pl-4'
            : 'items-end px-2 py-[10px] pl-[18px]'
        )}
      >
        <div ref={hiddenDivRef} style={HIDDEN_DIV_STYLES} aria-hidden />
        {hasAttachButton && onImageAttach ? (
          <ComposerAttachButton
            isCompact={isCompact}
            isImageProcessing={isImageProcessing}
            isLoading={isLoading}
            isSubmitting={isSubmitting}
            plusMenuOpen={plusMenuOpen}
            onOpenChange={setPlusMenuOpen}
            onMouseDown={handlePreserveFocus}
            onImageAttach={onImageAttach}
          />
        ) : null}

        <motion.textarea
          ref={internalTextareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={1}
          animate={textareaAnimateProp(
            reducedMotion,
            isPillMode,
            measuredHeight
          )}
          transition={reducedMotion ? undefined : SPRING_HEIGHT}
          className={cn(
            'min-w-0 flex-1 resize-none bg-transparent',
            'text-[14.5px] leading-[1.55] tracking-[-0.006em] text-primary-token placeholder:text-quaternary-token',
            'focus:outline-none',
            isPillMode
              ? 'overflow-hidden whitespace-nowrap py-[7px] px-1'
              : 'py-2 px-1',
            isAtMaxHeight && 'overflow-y-auto'
          )}
          style={textareaStyleProp(
            reducedMotion,
            isPillMode,
            isAtMaxHeight,
            measuredHeight
          )}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          maxLength={MAX_MESSAGE_LENGTH + 100}
          aria-label='Chat message input'
          aria-describedby={isNearLimit ? 'char-limit-status' : undefined}
        />

        {hasDictation ? (
          <ComposerMicButton
            isCompact={isCompact}
            isListening={isListening}
            isLoading={isLoading}
            isSubmitting={isSubmitting}
            onMouseDown={handlePreserveFocus}
            onToggle={handleMicToggle}
          />
        ) : null}

        <ComposerSendButton
          canSend={canSend}
          isStreaming={isStreaming}
          isLoading={isLoading}
          isSubmitting={isSubmitting}
          isCompact={isCompact}
          reducedMotion={reducedMotion}
          onMouseDown={handlePreserveFocus}
          onStop={onStop}
        />
      </div>
    </div>
  );
}
