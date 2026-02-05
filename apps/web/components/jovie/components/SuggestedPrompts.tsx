'use client';

import { cn } from '@/lib/utils';

import { SUGGESTED_PROMPTS } from '../types';

interface SuggestedPromptsProps {
  readonly onSelect: (prompt: string) => void;
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className='space-y-3'>
      <p className='text-center text-sm text-tertiary-token'>
        Try asking about:
      </p>
      <div className='flex flex-wrap justify-center gap-2'>
        {SUGGESTED_PROMPTS.map(prompt => (
          <button
            key={prompt}
            type='button'
            onClick={() => onSelect(prompt)}
            className={cn(
              'rounded-full border border-subtle bg-surface-1 px-4 py-2 text-sm',
              'text-secondary-token transition-colors duration-fast',
              'hover:border-default hover:bg-surface-2 hover:text-primary-token',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:ring-offset-2'
            )}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
