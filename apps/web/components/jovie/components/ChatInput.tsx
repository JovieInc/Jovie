'use client';

import { Button, SimpleTooltip } from '@jovie/ui';
import { ArrowUp, ImagePlus, Loader2 } from 'lucide-react';
import { forwardRef, useCallback } from 'react';

import { cn } from '@/lib/utils';

import type { PendingImage } from '../hooks/useChatImageAttachments';
import { MAX_MESSAGE_LENGTH } from '../types';
import { ImagePreviewStrip } from './ImagePreviewStrip';

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
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput(
    {
      value,
      onChange,
      onSubmit,
      isLoading,
      isSubmitting,
      placeholder = 'What do you wanna ask Jovie?',
      variant = 'default',
      onImageAttach,
      isImageProcessing = false,
      pendingImages,
      onRemoveImage,
      onPaste,
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
      !isOverLimit;

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

    const isCompact = variant === 'compact';
    let paddingRight = 'pr-14';
    if (hasAttachButton) {
      paddingRight = isCompact ? 'pr-24' : 'pr-28';
    }
    const sizeClasses = isCompact
      ? cn('px-4 py-3 max-h-32', paddingRight)
      : cn('px-4 py-4 max-h-48', paddingRight);

    return (
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmit(e);
        }}
      >
        <div
          className={cn(
            'rounded-xl border bg-surface-1 transition-colors duration-fast',
            isOverLimit
              ? 'border-error focus-within:border-error focus-within:ring-2 focus-within:ring-error/20'
              : 'border-white/[0.08] focus-within:border-white/[0.14]'
          )}
        >
          {hasPendingImages && onRemoveImage && (
            <ImagePreviewStrip
              images={pendingImages!}
              onRemove={onRemoveImage}
            />
          )}

          <div className='relative'>
            <textarea
              ref={ref}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              rows={1}
              className={cn(
                'w-full resize-none bg-transparent',
                'text-primary-token placeholder:text-tertiary-token',
                'focus:outline-none',
                sizeClasses
              )}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={onPaste}
              maxLength={MAX_MESSAGE_LENGTH + 100}
              aria-label='Chat message input'
              aria-describedby={isNearLimit ? 'char-limit-status' : undefined}
            />

            {onImageAttach && (
              <SimpleTooltip content='Attach image'>
                <button
                  type='button'
                  onClick={onImageAttach}
                  disabled={isImageProcessing || isLoading || isSubmitting}
                  className={cn(
                    'absolute flex items-center justify-center rounded-lg',
                    'text-tertiary-token transition-colors',
                    'hover:text-secondary-token hover:bg-surface-2',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isCompact
                      ? 'bottom-2 right-12 h-8 w-8'
                      : 'bottom-3 right-14 h-10 w-10'
                  )}
                  aria-label='Attach image'
                >
                  {isImageProcessing ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <ImagePlus className='h-4 w-4' />
                  )}
                </button>
              </SimpleTooltip>
            )}

            <Button
              type='submit'
              size='icon'
              disabled={!canSend}
              className={cn(
                'absolute rounded-lg',
                isCompact
                  ? 'bottom-2 right-2 h-8 w-8'
                  : 'bottom-3 right-3 h-10 w-10'
              )}
              aria-label='Send message'
            >
              {isLoading || isSubmitting ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <ArrowUp className='h-4 w-4' />
              )}
            </Button>

            {isNearLimit && (
              <output
                id='char-limit-status'
                aria-live='polite'
                className={cn(
                  'absolute text-xs',
                  isCompact ? 'bottom-2 left-3' : 'bottom-3 left-3',
                  isOverLimit ? 'text-error' : 'text-tertiary-token'
                )}
              >
                {isOverLimit
                  ? `Message is ${characterCount - MAX_MESSAGE_LENGTH} characters over the limit (${characterCount}/${MAX_MESSAGE_LENGTH})`
                  : `${characterCount}/${MAX_MESSAGE_LENGTH} characters`}
              </output>
            )}
          </div>
        </div>
      </form>
    );
  }
);
