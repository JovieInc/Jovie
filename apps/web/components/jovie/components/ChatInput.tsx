'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleTooltip,
} from '@jovie/ui';
import { ArrowUp, ImagePlus, Loader2, Mic, MicOff, Plus } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTheme } from 'next-themes';
import {
  forwardRef,
  useCallback,
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
import { ChipTray } from './ChipTray';
import {
  CHAT_PROMPT_RAIL_CLASS,
  CHAT_PROMPT_RAIL_MASK_STYLE,
  CHAT_PROMPT_RAIL_SCROLL_CLASS,
  getChatPromptPillClass,
} from './chat-prompt-styles';
import { ImagePreviewStrip } from './ImagePreviewStrip';
import { SlashCommandMenu, type SlashMenuMode } from './SlashCommandMenu';
import { detectSlashTriggerAt } from './slash-trigger';

/** DESIGN.md standard easing */
const EASE_INTERACTIVE = [0.25, 0.46, 0.45, 0.94] as const;

/** Spring config for layout (height) transitions — physical feel */
const SPRING_LAYOUT = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 30,
  mass: 0.8,
};

/** Fast cross-fade for icon morphs (100ms) */
const TRANSITION_FAST = { duration: 0.1, ease: EASE_INTERACTIVE };

// ─── Sub-components ──────────────────────────────────────────────

interface ChatQuickAction {
  readonly label: string;
  readonly prompt: string;
}

interface SendStopButtonProps {
  readonly canSend: boolean;
  readonly isStreaming: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isCompact: boolean;
  readonly reducedMotion: boolean | null;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onStop?: () => void;
}

function getButtonIcon(
  showStop: boolean,
  isLoading: boolean,
  isSubmitting: boolean,
  isCompact: boolean
): { key: string; icon: React.ReactNode } {
  const iconSize = isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  if (showStop) {
    return {
      key: 'stop',
      icon: (
        <span
          className={cn(
            'block rounded-[2px] bg-current',
            isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'
          )}
        />
      ),
    };
  }
  if (isLoading || isSubmitting) {
    return {
      key: 'loading',
      icon: <Loader2 className={cn('animate-spin', iconSize)} />,
    };
  }
  return { key: 'send', icon: <ArrowUp className={iconSize} /> };
}

function SendStopButton({
  canSend,
  isStreaming,
  isLoading,
  isSubmitting,
  isCompact,
  reducedMotion,
  onMouseDown,
  onStop,
}: SendStopButtonProps) {
  const showStop = isStreaming && onStop;
  const { key, icon } = getButtonIcon(
    Boolean(showStop),
    isLoading,
    isSubmitting,
    isCompact
  );
  const motionInit = reducedMotion ? undefined : { scale: 0.5, opacity: 0 };

  return (
    <SimpleTooltip content={showStop ? 'Stop generating' : 'Send message'}>
      <button
        type={showStop ? 'button' : 'submit'}
        onMouseDown={onMouseDown}
        onClick={showStop ? onStop : undefined}
        disabled={!showStop && !canSend}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow] duration-fast',
          showStop || canSend
            ? 'border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-[0_1px_1px_rgba(0,0,0,0.06),0_6px_16px_-10px_rgba(0,0,0,0.24)] hover:bg-(--linear-btn-primary-hover)'
            : 'cursor-not-allowed border-(--linear-app-frame-seam) bg-surface-0 text-tertiary-token',
          isCompact ? 'h-8 w-8' : 'h-9 w-9'
        )}
        aria-label={showStop ? 'Stop generating' : 'Send message'}
      >
        <AnimatePresence mode='wait' initial={false}>
          <motion.span
            key={key}
            initial={motionInit}
            animate={{ scale: 1, opacity: 1 }}
            exit={motionInit}
            transition={TRANSITION_FAST}
            className='flex items-center justify-center'
          >
            {icon}
          </motion.span>
        </AnimatePresence>
      </button>
    </SimpleTooltip>
  );
}

interface AttachDropdownProps {
  readonly isCompact: boolean;
  readonly isImageProcessing: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly plusMenuOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onImageAttach: () => void;
}

function AttachDropdown({
  isCompact,
  isImageProcessing,
  isLoading,
  isSubmitting,
  plusMenuOpen,
  onOpenChange,
  onMouseDown,
  onImageAttach,
}: AttachDropdownProps) {
  return (
    <DropdownMenu open={plusMenuOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          onMouseDown={onMouseDown}
          disabled={isImageProcessing || isLoading || isSubmitting}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full',
            'border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token transition-[background-color,border-color,color,box-shadow]',
            'hover:border-default hover:bg-surface-1 hover:text-primary-token hover:shadow-[var(--linear-app-card-shadow)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isCompact ? 'h-8 w-8' : 'h-9 w-9'
          )}
          aria-label='Attachment options'
        >
          {isImageProcessing ? (
            <Loader2
              className={cn(
                'animate-spin',
                isCompact ? 'h-4 w-4' : 'h-[18px] w-[18px]'
              )}
            />
          ) : (
            <Plus className={cn(isCompact ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' side='top' sideOffset={8}>
        <DropdownMenuItem
          onSelect={() => {
            onImageAttach();
          }}
        >
          <ImagePlus className='mr-2 h-4 w-4' />
          Attach image
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main ChatInput ──────────────────────────────────────────────

interface ChatInputProps {
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
      (value.trim() || hasPendingImages) &&
      !isLoading &&
      !isSubmitting &&
      !isOverLimit &&
      !isImageProcessing;

    const [plusMenuOpen, setPlusMenuOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const isCompact = variant === 'compact';
    const maxHeight = isCompact ? 128 : 192;
    const minHeight = 28;

    // Internal textarea ref for width measurement
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    // Forward the ref to the parent while keeping internal access
    useImperativeHandle(ref, () => internalTextareaRef.current!, []);

    // Smooth textarea height measurement (no height:'auto' trick)
    const { measuredHeight, isAtMaxHeight, containerRef, hiddenDivRef } =
      useTextareaAutosize({
        value,
        minHeight,
        maxHeight,
        textareaRef: internalTextareaRef,
      });

    // Dictation baseline snapshot
    const dictationBaselineRef = useRef('');

    // Slash-command trigger detection. Opens the menu when the text ending at
    // the caret matches `/<query>` at a word boundary (start-of-input or after
    // whitespace). The query is everything after the `/` up to the caret.
    // Mode switches to an entity kind when the user picks a skill with a
    // required slot (orchestrated by the skill-select handler below).
    const [slashMenuMode, setSlashMenuMode] = useState<SlashMenuMode | null>(
      null
    );
    const [slashQuery, setSlashQuery] = useState('');
    // Index in `value` where the `/` was typed — we slice it out when a pick
    // commits, preserving any text the user typed outside the trigger.
    const slashStartRef = useRef<number | null>(null);

    const detectSlashTrigger = useCallback(
      (text: string, caret: number) => detectSlashTriggerAt(text, caret),
      []
    );

    const handleChange = useCallback(
      (next: string) => {
        onChange(next);
        const el = internalTextareaRef.current;
        const caret = el?.selectionStart ?? next.length;
        const trigger = detectSlashTrigger(next, caret);
        if (trigger) {
          slashStartRef.current = trigger.startIdx;
          setSlashQuery(trigger.query);
          // Only auto-open in 'all' mode; if user is mid-entity-pick, keep scope.
          setSlashMenuMode(prev => prev ?? 'all');
        } else if (slashMenuMode === 'all') {
          // Slash trigger gone (user deleted `/` or inserted whitespace) — close.
          setSlashMenuMode(null);
          slashStartRef.current = null;
        }
      },
      [onChange, detectSlashTrigger, slashMenuMode]
    );

    const stripSlashQuery = useCallback(() => {
      const startIdx = slashStartRef.current;
      if (startIdx === null) return;
      // Remove `/query` from the textarea; the chip is now the real token.
      const el = internalTextareaRef.current;
      const caret = el?.selectionStart ?? value.length;
      const nextValue = value.slice(0, startIdx) + value.slice(caret);
      onChange(nextValue);
      slashStartRef.current = null;
      setSlashQuery('');
    }, [onChange, value]);

    const closeSlashMenu = useCallback(() => {
      setSlashMenuMode(null);
      slashStartRef.current = null;
      setSlashQuery('');
    }, []);

    const handleSelectSkill = useCallback(
      (skill: import('@/lib/commands/registry').SkillCommand) => {
        onAddSkill?.(skill.id);
        stripSlashQuery();
        const requiredSlot = skill.entitySlots.find(s => s.required);
        if (requiredSlot) {
          // Two-step picker: reopen menu scoped to the required entity kind.
          setSlashMenuMode(requiredSlot.kind);
          setSlashQuery('');
        } else {
          closeSlashMenu();
        }
      },
      [onAddSkill, stripSlashQuery, closeSlashMenu]
    );

    const handleSelectEntity = useCallback(
      (entity: import('@/lib/commands/entities').EntityRef) => {
        onAddEntity?.({
          kind: entity.kind,
          id: entity.id,
          label: entity.label,
        });
        stripSlashQuery();
        closeSlashMenu();
      },
      [onAddEntity, stripSlashQuery, closeSlashMenu]
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

    // IME-safe Enter handling + backspace-on-empty removes the last chip
    // (Linear-style: chips feel attached to the end of the input).
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
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
      [onSubmit, canSend, value, chips, onRemoveLastChip]
    );

    // Focus retention on toolbar button clicks
    const handleMouseDown = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
      },
      []
    );

    // isExpanded drives footer visibility (independent of measuredHeight)
    const isExpanded =
      isFocused ||
      plusMenuOpen ||
      isListening ||
      Boolean(value.trim()) ||
      hasPendingImages;

    const hasQuickActions =
      Boolean(onQuickActionSelect) && (quickActions?.length ?? 0) > 0;

    // Both collapsed and expanded resolve to 32px radius for a pill shape.
    const borderRadius = isCompact ? 26 : 30;

    // Shadow states
    let boxShadow = isDark
      ? '0 2px 8px -4px rgba(0,0,0,0.28)'
      : '0 2px 8px -4px rgba(15,23,42,0.07)';
    if (isOverLimit) {
      boxShadow = 'none';
    } else if (isExpanded) {
      boxShadow = isDark
        ? '0 4px 16px -6px rgba(0,0,0,0.32)'
        : '0 4px 16px -6px rgba(15,23,42,0.09)';
    }

    // Border style by state
    let borderClass = 'border-black/6 dark:border-white/[0.07]';
    if (isOverLimit) {
      borderClass =
        'border-error focus-within:border-error focus-within:ring-2 focus-within:ring-error/20';
    } else if (isExpanded) {
      borderClass = 'border-black/8 dark:border-white/[0.09]';
    }

    return (
      <form onSubmit={handleFormSubmit}>
        <motion.div
          animate={reducedMotion ? undefined : { borderRadius, boxShadow }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.15, ease: EASE_INTERACTIVE }
          }
          className={cn(
            'overflow-hidden border transition-[border-color,background-color,box-shadow] duration-normal',
            // Always one elevation above the content surface — shadow is animated via motion.div
            'bg-surface-1',
            borderClass
          )}
          style={reducedMotion ? { borderRadius, boxShadow } : { borderRadius }}
        >
          {/* Image previews */}
          {hasPendingImages && onRemoveImage && (
            <div className='px-4 pt-3'>
              <ImagePreviewStrip
                images={pendingImages ?? []}
                onRemove={onRemoveImage}
              />
            </div>
          )}

          {/* Chip tray — rendered above the textarea when chips are present */}
          {chips && chips.length > 0 && onRemoveChipAt && (
            <div className='px-4 pt-3'>
              <ChipTray chips={chips} onRemoveAt={onRemoveChipAt} />
            </div>
          )}

          {/* Textarea row */}
          <div
            ref={containerRef}
            className={cn(
              'relative flex items-center gap-2 px-4 py-3',
              isExpanded && 'pb-3'
            )}
          >
            {/* Hidden measurement div */}
            <div ref={hiddenDivRef} style={HIDDEN_DIV_STYLES} aria-hidden />
            {hasAttachButton && onImageAttach && (
              <AttachDropdown
                isCompact={isCompact}
                isImageProcessing={isImageProcessing}
                isLoading={isLoading}
                isSubmitting={isSubmitting}
                plusMenuOpen={plusMenuOpen}
                onOpenChange={setPlusMenuOpen}
                onMouseDown={handleMouseDown}
                onImageAttach={onImageAttach}
              />
            )}

            {/* Animated textarea */}
            <motion.textarea
              ref={internalTextareaRef}
              value={value}
              onChange={e => handleChange(e.target.value)}
              placeholder={placeholder}
              rows={1}
              animate={reducedMotion ? undefined : { height: measuredHeight }}
              transition={reducedMotion ? undefined : SPRING_LAYOUT}
              className={cn(
                'min-w-0 flex-1 resize-none bg-transparent',
                'text-primary-token placeholder:text-tertiary-token',
                'focus:outline-none',
                'py-1.5 text-[14px] leading-6',
                isAtMaxHeight && 'overflow-y-auto',
                isAtMaxHeight &&
                  'shadow-[inset_0_8px_6px_-6px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_8px_6px_-6px_rgba(0,0,0,0.2)]'
              )}
              style={
                reducedMotion
                  ? {
                      height: measuredHeight,
                      overflow: isAtMaxHeight ? 'auto' : 'hidden',
                    }
                  : { overflow: isAtMaxHeight ? 'auto' : 'hidden' }
              }
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              maxLength={MAX_MESSAGE_LENGTH + 100}
              aria-label='Chat message input'
              aria-describedby={isNearLimit ? 'char-limit-status' : undefined}
            />

            {/* Slash command menu — opens when user types `/` at word boundary */}
            {slashMenuMode && onAddSkill && onAddEntity ? (
              <SlashCommandMenu
                open
                anchorRef={internalTextareaRef}
                query={slashQuery}
                mode={slashMenuMode}
                onSelectSkill={handleSelectSkill}
                onSelectEntity={handleSelectEntity}
                onClose={closeSlashMenu}
              />
            ) : null}

            {/* Mic toggle */}
            {hasDictation && (
              <SimpleTooltip
                content={isListening ? 'Stop dictation' : 'Dictate message'}
              >
                <button
                  type='button'
                  onMouseDown={handleMouseDown}
                  onClick={handleMicToggle}
                  disabled={isLoading || isSubmitting}
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow]',
                    isListening
                      ? 'border-error/20 bg-error/10 text-error'
                      : 'border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token hover:border-default hover:bg-surface-1 hover:text-primary-token hover:shadow-[var(--linear-app-card-shadow)]',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isCompact ? 'h-8 w-8' : 'h-9 w-9'
                  )}
                  aria-label={
                    isListening ? 'Stop dictation' : 'Dictate message'
                  }
                  aria-pressed={isListening}
                >
                  {isListening ? (
                    <MicOff
                      className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
                    />
                  ) : (
                    <Mic
                      className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
                    />
                  )}
                </button>
              </SimpleTooltip>
            )}

            {/* Send / Stop button */}
            <SendStopButton
              canSend={Boolean(canSend)}
              isStreaming={isStreaming}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              isCompact={isCompact}
              reducedMotion={reducedMotion}
              onMouseDown={handleMouseDown}
              onStop={onStop}
            />
          </div>

          {/* Expandable footer with smooth reveal */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { duration: 0.15, ease: EASE_INTERACTIVE }
                }
                style={{ overflow: 'hidden' }}
              >
                <div className='border-t border-black/6 px-3 pb-3 pt-2.5 dark:border-white/8'>
                  {/* Quick actions first (actionable), then keyboard hint */}
                  {hasQuickActions && quickActions ? (
                    <div className='mb-2'>
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
                              onMouseDown={handleMouseDown}
                              onClick={() =>
                                onQuickActionSelect?.(action.prompt)
                              }
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
                    </div>
                  ) : null}

                  <div className='flex items-center justify-end'>
                    <span className='text-[11px] text-tertiary-token'>
                      ⏎ to send · Shift+Enter for newline
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Character limit with smooth reveal */}
          <AnimatePresence initial={false}>
            {isNearLimit && (
              <motion.output
                id='char-limit-status'
                aria-live='polite'
                initial={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { duration: 0.15, ease: EASE_INTERACTIVE }
                }
                style={{ overflow: 'hidden' }}
                className={cn(
                  'block px-4 pb-1.5 text-xs',
                  isOverLimit ? 'text-error' : 'text-tertiary-token'
                )}
              >
                {isOverLimit
                  ? `Message is ${characterCount - MAX_MESSAGE_LENGTH} characters over the limit (${characterCount}/${MAX_MESSAGE_LENGTH})`
                  : `${characterCount}/${MAX_MESSAGE_LENGTH} characters`}
              </motion.output>
            )}
          </AnimatePresence>
        </motion.div>
      </form>
    );
  }
);
