'use client';

import { ArrowUp, Loader2 } from 'lucide-react';
import { forwardRef, useCallback } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
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
    },
    ref
  ) {
    const characterCount = value.length;
    const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.9;
    const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;

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
        target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
      },
      []
    );

    const isCompact = variant === 'compact';

    const containerClasses = cn(
      'flex w-full items-center gap-3 rounded-full border bg-surface-2/80',
      'transition-colors duration-fast focus-within:ring-1 focus-within:ring-offset-0',
      isCompact ? 'px-4 py-2 min-h-[52px]' : 'px-5 py-3 min-h-[76px]',
      isOverLimit
        ? 'border-error/80 focus-within:border-error/80 focus-within:ring-error/15'
        : 'border-subtle/70 focus-within:border-interactive/60 focus-within:ring-[rgb(var(--focus-ring))/0.28]'
    );

    const textAreaClasses = cn(
      'flex-1 resize-none border-none bg-transparent text-sm font-medium',
      'text-primary-token placeholder:text-secondary-token/70',
      'focus:outline-none focus-visible:outline-none leading-5',
      isCompact ? 'pt-1' : 'pt-0.5'
    );

    return (
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmit(e);
        }}
        className='space-y-2'
      >
        <div className={containerClasses}>
          <textarea
            ref={ref}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={isCompact ? 1 : 2}
            className={textAreaClasses}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            maxLength={MAX_MESSAGE_LENGTH + 100}
            aria-label='Chat message input'
            aria-describedby={isOverLimit ? 'char-limit-error' : undefined}
          />
          <CircleIconButton
            type='submit'
            size={isCompact ? 'sm' : 'md'}
            variant='ghost'
            disabled={!value.trim() || isLoading || isSubmitting || isOverLimit}
            className={cn(
              'shrink-0 border border-(--color-border-subtle)/80 bg-surface-0/30 text-secondary-token',
              'hover:bg-surface-0/60 hover:text-primary-token'
            )}
            ariaLabel='Send message'
          >
            {isLoading || isSubmitting ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <ArrowUp className='h-4 w-4' />
            )}
          </CircleIconButton>
        </div>

        {isNearLimit && (
          <div
            id='char-limit-error'
            className={cn(
              'text-right text-xs',
              isOverLimit ? 'text-error' : 'text-tertiary-token'
            )}
          >
            {characterCount}/{MAX_MESSAGE_LENGTH}
          </div>
        )}
      </form>
    );
  }
);
