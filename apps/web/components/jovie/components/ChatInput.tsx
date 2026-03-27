'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleTooltip,
} from '@jovie/ui';
import { ArrowUp, ImagePlus, Loader2, Mic, MicOff, Plus } from 'lucide-react';
import { forwardRef, useCallback, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import type { PendingImage } from '../hooks/useChatImageAttachments';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { MAX_MESSAGE_LENGTH } from '../types';
import {
  CHAT_PROMPT_RAIL_CLASS,
  CHAT_PROMPT_RAIL_MASK_STYLE,
  CHAT_PROMPT_RAIL_SCROLL_CLASS,
  getChatPromptPillClass,
} from './chat-prompt-styles';
import { ImagePreviewStrip } from './ImagePreviewStrip';

interface ChatQuickAction {
  readonly label: string;
  readonly prompt: string;
}

interface SendButtonProps {
  readonly canSend: boolean;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isCompact: boolean;
  readonly onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function SendButton({
  canSend,
  isLoading,
  isSubmitting,
  isCompact,
  onMouseDown,
}: SendButtonProps) {
  return (
    <SimpleTooltip content='Send message'>
      <button
        type='submit'
        onMouseDown={onMouseDown}
        disabled={!canSend}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border transition-all duration-fast',
          canSend
            ? 'border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-[0_1px_1px_rgba(0,0,0,0.06),0_6px_16px_-10px_rgba(0,0,0,0.24)] hover:bg-(--linear-btn-primary-hover)'
            : 'cursor-not-allowed border-(--linear-app-frame-seam) bg-surface-0 text-tertiary-token',
          isCompact ? 'h-8 w-8' : 'h-9 w-9'
        )}
        aria-label='Send message'
      >
        {isLoading || isSubmitting ? (
          <Loader2
            className={cn(
              'animate-spin',
              isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'
            )}
          />
        ) : (
          <ArrowUp className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        )}
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

interface ChatInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (e?: React.FormEvent) => void;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly placeholder?: string;
  /** Compact variant for chat view, default for empty state */
  readonly variant?: 'default' | 'compact';
  /** Callback when the image attach button is clicked */
  readonly onImageAttach?: () => void;
  /** Whether images are being processed (reading as data URLs) */
  readonly isImageProcessing?: boolean;
  /** Pending image attachments to preview */
  readonly pendingImages?: PendingImage[];
  /** Remove a pending image by ID */
  readonly onRemoveImage?: (id: string) => void;
  /** Handle paste events for image content */
  readonly onPaste?: (e: React.ClipboardEvent) => void;
  /** Optional quick actions shown underneath the composer when expanded */
  readonly quickActions?: readonly ChatQuickAction[];
  /** Callback when a quick action is selected */
  readonly onQuickActionSelect?: (prompt: string) => void;
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
    },
    ref
  ) {
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

    // Snapshot of the input value at the moment dictation starts, so that the
    // in-session transcript is appended rather than replacing existing text.
    const dictationBaselineRef = useRef('');

    // Voice dictation via Web Speech API
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
        // Capture the current input value as the baseline before recording.
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
        if (e.key === 'Enter' && !e.shiftKey && canSend) {
          e.preventDefault();
          onSubmit();
        }
      },
      [onSubmit, canSend]
    );

    const handleInput = useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        const target = e.target as HTMLTextAreaElement;
        target.style.height = 'auto';
        const maxH = variant === 'compact' ? 128 : 192;
        target.style.height = `${Math.min(target.scrollHeight, maxH)}px`;
      },
      [variant]
    );

    const handleMouseDown = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        // Keep focus in the textarea when clicking action buttons.
        event.preventDefault();
      },
      []
    );

    const isCompact = variant === 'compact';
    const isExpanded =
      isFocused ||
      plusMenuOpen ||
      isListening ||
      Boolean(value.trim()) ||
      hasPendingImages;
    const hasQuickActions =
      Boolean(onQuickActionSelect) && (quickActions?.length ?? 0) > 0;

    return (
      <form onSubmit={handleFormSubmit}>
        <div
          className={cn(
            'overflow-hidden border transition-[border-color,background-color,box-shadow,border-radius] duration-200',
            isExpanded ? 'rounded-[24px]' : 'rounded-full',
            'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))]',
            isOverLimit
              ? 'border-error focus-within:border-error focus-within:ring-2 focus-within:ring-error/20'
              : isExpanded
                ? 'border-black/8 bg-surface-0 shadow-[0_1px_0_rgba(255,255,255,0.65),0_18px_34px_-28px_rgba(15,23,42,0.45)] dark:border-white/10'
                : 'border-black/6 shadow-[0_1px_0_rgba(255,255,255,0.72),0_10px_22px_-20px_rgba(15,23,42,0.42)] dark:border-white/8'
          )}
        >
          {hasPendingImages && onRemoveImage && (
            <div className='px-4 pt-3'>
              <ImagePreviewStrip
                images={pendingImages ?? []}
                onRemove={onRemoveImage}
              />
            </div>
          )}

          <div
            className={cn(
              'flex items-end gap-2 px-3 py-2.5',
              isExpanded && 'pb-2'
            )}
          >
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

            {/* Textarea */}
            <textarea
              ref={ref}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              rows={1}
              className={cn(
                'min-w-0 flex-1 resize-none bg-transparent',
                'text-primary-token placeholder:text-tertiary-token',
                'focus:outline-none',
                'py-1.5 text-[14px] leading-6',
                isCompact ? 'max-h-32' : 'max-h-48',
                isExpanded
                  ? isCompact
                    ? 'min-h-[64px]'
                    : 'min-h-[88px]'
                  : 'min-h-[28px]'
              )}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={onPaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              maxLength={MAX_MESSAGE_LENGTH + 100}
              aria-label='Chat message input'
              aria-describedby={isNearLimit ? 'char-limit-status' : undefined}
            />

            {/* Mic: Voice dictation toggle (hidden when unsupported) */}
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

            {/* Right: Circular send button */}
            <SendButton
              canSend={Boolean(canSend)}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              isCompact={isCompact}
              onMouseDown={handleMouseDown}
            />
          </div>

          {isExpanded && (
            <div className='border-t border-black/6 px-3 pb-3 pt-2.5 dark:border-white/8'>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-[11px] font-[560] tracking-[-0.01em] text-secondary-token'>
                  {isCompact ? 'Ask a follow-up' : 'Ask Jovie'}
                </span>
                <span className='text-[11px] text-tertiary-token'>
                  Shift+Enter for newline
                </span>
              </div>

              {hasQuickActions && quickActions ? (
                <div className='mt-2'>
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
                </div>
              ) : null}
            </div>
          )}

          {isNearLimit && (
            <output
              id='char-limit-status'
              aria-live='polite'
              className={cn(
                'block px-4 pb-1.5 text-xs',
                isOverLimit ? 'text-error' : 'text-tertiary-token'
              )}
            >
              {isOverLimit
                ? `Message is ${characterCount - MAX_MESSAGE_LENGTH} characters over the limit (${characterCount}/${MAX_MESSAGE_LENGTH})`
                : `${characterCount}/${MAX_MESSAGE_LENGTH} characters`}
            </output>
          )}
        </div>
      </form>
    );
  }
);
