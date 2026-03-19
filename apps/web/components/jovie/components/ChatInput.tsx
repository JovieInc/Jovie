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
import { ImagePreviewStrip } from './ImagePreviewStrip';

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
          'flex shrink-0 items-center justify-center rounded-full transition-all duration-fast',
          canSend
            ? 'bg-accent text-accent-foreground hover:bg-accent/90'
            : 'bg-surface-2 text-tertiary-token cursor-not-allowed',
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
            'bg-surface-2 text-secondary-token transition-colors',
            'hover:bg-surface-3 hover:text-primary-token',
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
  /** Called when the input receives focus */
  readonly onFocus?: () => void;
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
      onFocus,
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

    return (
      <form onSubmit={handleFormSubmit}>
        <div
          className={cn(
            'rounded-full border bg-surface-1 transition-colors duration-fast',
            isOverLimit
              ? 'border-error focus-within:border-error focus-within:ring-2 focus-within:ring-error/20'
              : 'border-subtle focus-within:border-default focus-within:ring-2 focus-within:ring-accent/20'
          )}
        >
          {hasPendingImages && onRemoveImage && (
            <div className='px-4 pt-2'>
              <ImagePreviewStrip
                images={pendingImages ?? []}
                onRemove={onRemoveImage}
              />
            </div>
          )}

          <div className='flex items-end gap-2 px-2 py-1.5'>
            {/* Left: Circular plus button with attachment dropdown */}
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
              onFocus={onFocus}
              placeholder={placeholder}
              rows={1}
              className={cn(
                'min-w-0 flex-1 resize-none bg-transparent',
                'text-primary-token placeholder:text-tertiary-token',
                'focus:outline-none',
                isCompact ? 'py-1.5 max-h-32 text-sm' : 'py-2 max-h-48 text-sm'
              )}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={onPaste}
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
                    'flex shrink-0 items-center justify-center rounded-full transition-colors',
                    isListening
                      ? 'bg-error/10 text-error'
                      : 'text-secondary-token hover:text-primary-token',
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
