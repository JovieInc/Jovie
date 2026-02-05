'use client';

import { Button } from '@jovie/ui';
import { ArrowUp, Loader2 } from 'lucide-react';
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
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      },
      [onSubmit]
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

    return (
      <form onSubmit={onSubmit} className={cn(!isCompact && 'relative')}>
        <div className={cn(isCompact && 'relative')}>
          <textarea
            ref={ref}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border bg-surface-1',
              'text-primary-token placeholder:text-tertiary-token',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-1',
              'transition-colors duration-fast',
              isCompact
                ? 'px-4 py-3 pr-14 max-h-32'
                : 'px-4 py-4 pr-14 min-h-[120px]',
              isOverLimit
                ? 'border-error focus:border-error focus:ring-error/20'
                : 'border-subtle focus:border-accent focus:ring-accent/20'
            )}
            onKeyDown={handleKeyDown}
            onInput={isCompact ? handleInput : undefined}
            maxLength={MAX_MESSAGE_LENGTH + 100}
            aria-label='Chat message input'
            aria-describedby={isOverLimit ? 'char-limit-error' : undefined}
          />
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
            <div
              id='char-limit-error'
              className={cn(
                'absolute text-xs',
                isCompact ? 'bottom-2 left-3' : 'bottom-3 left-3',
                isOverLimit ? 'text-error' : 'text-tertiary-token'
              )}
            >
              {characterCount}/{MAX_MESSAGE_LENGTH}
            </div>
          )}
        </div>
      </form>
    );
  }
);
