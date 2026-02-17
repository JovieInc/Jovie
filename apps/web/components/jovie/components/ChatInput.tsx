'use client';

import { Button, SimpleTooltip } from '@jovie/ui';
import { ArrowUp, Camera, Loader2 } from 'lucide-react';
import { forwardRef, useCallback } from 'react';

import { cn } from '@/lib/utils';

import { MAX_MESSAGE_LENGTH } from '../types';

interface ChatInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (e?: React.FormEvent) => void;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly placeholder?: string;
  /** Compact variant for chat view, default for empty state */
  readonly variant?: 'default' | 'compact';
  /** Callback when the image upload button is clicked */
  readonly onImageUpload?: () => void;
  /** Whether an image is currently uploading */
  readonly isImageUploading?: boolean;
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
      onImageUpload,
      isImageUploading = false,
    },
    ref
  ) {
    const characterCount = value.length;
    const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.9;
    const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;
    const hasImageUpload = Boolean(onImageUpload);

    const handleFormSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(e);
      },
      [onSubmit]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
      [onChange]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (
          e.key === 'Enter' &&
          !e.shiftKey &&
          value.trim() &&
          !isLoading &&
          !isSubmitting &&
          !isOverLimit
        ) {
          e.preventDefault();
          onSubmit();
        }
      },
      [onSubmit, value, isLoading, isSubmitting, isOverLimit]
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
    if (hasImageUpload) {
      paddingRight = isCompact ? 'pr-24' : 'pr-28';
    }
    const sizeClasses = isCompact
      ? cn('px-4 py-3 max-h-32', paddingRight)
      : cn('px-4 py-4 max-h-48', paddingRight);

    return (
      <form onSubmit={handleFormSubmit}>
        <div className='relative'>
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border bg-surface-1',
              'text-primary-token placeholder:text-tertiary-token',
              'focus:outline-none',
              'transition-colors duration-fast',
              sizeClasses,
              isOverLimit
                ? 'border-error focus:border-error focus:ring-2 focus:ring-error/20'
                : 'border-white/[0.08] focus:border-white/[0.14]'
            )}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            maxLength={MAX_MESSAGE_LENGTH + 100}
            aria-label='Chat message input'
            aria-describedby={isNearLimit ? 'char-limit-status' : undefined}
          />

          {onImageUpload && (
            <SimpleTooltip content='Upload profile photo'>
              <button
                type='button'
                onClick={onImageUpload}
                disabled={isImageUploading || isLoading || isSubmitting}
                className={cn(
                  'absolute flex items-center justify-center rounded-lg',
                  'text-tertiary-token transition-colors',
                  'hover:text-secondary-token hover:bg-surface-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isCompact
                    ? 'bottom-2 right-12 h-8 w-8'
                    : 'bottom-3 right-14 h-10 w-10'
                )}
                aria-label='Upload profile photo'
              >
                {isImageUploading ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Camera className='h-4 w-4' />
                )}
              </button>
            </SimpleTooltip>
          )}

          <Button
            type='submit'
            size='icon'
            disabled={!value.trim() || isLoading || isSubmitting || isOverLimit}
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
      </form>
    );
  }
);
