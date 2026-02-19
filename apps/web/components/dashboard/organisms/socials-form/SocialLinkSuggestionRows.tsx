'use client';

import { Check, Loader2, X } from 'lucide-react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import type { SocialLinkSuggestion } from './useSocialLinkSuggestions';

interface SocialLinkSuggestionRowsProps {
  readonly suggestions: SocialLinkSuggestion[];
  readonly actioningId: string | null;
  readonly onConfirm: (suggestion: SocialLinkSuggestion) => void;
  readonly onDismiss: (suggestion: SocialLinkSuggestion) => void;
}

export function SocialLinkSuggestionRows({
  suggestions,
  actioningId,
  onConfirm,
  onDismiss,
}: SocialLinkSuggestionRowsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className='space-y-2'>
      <p className='text-xs font-medium text-secondary-token'>
        Detected profiles
      </p>
      <div className='rounded-lg border border-accent/20 bg-accent/5 divide-y divide-accent/10'>
        {suggestions.map(suggestion => {
          const isActioning = actioningId === suggestion.id;

          return (
            <div
              key={suggestion.id}
              className='flex items-center gap-3 px-4 py-2.5'
            >
              <SocialIcon
                platform={suggestion.platform}
                className='h-4 w-4 shrink-0'
                aria-hidden
              />
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium text-primary-token truncate'>
                  {suggestion.platformLabel}
                </p>
                <p className='text-xs text-tertiary-token truncate'>
                  {suggestion.username
                    ? `@${suggestion.username}`
                    : suggestion.url}
                </p>
              </div>
              <div className='flex items-center gap-1.5 shrink-0'>
                <button
                  type='button'
                  onClick={() => onConfirm(suggestion)}
                  disabled={isActioning}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md',
                    'bg-accent text-on-accent hover:bg-accent/90',
                    'disabled:opacity-50 transition-colors'
                  )}
                >
                  {isActioning ? (
                    <Loader2 className='h-3 w-3 animate-spin' />
                  ) : (
                    <Check className='h-3 w-3' />
                  )}
                  Add
                </button>
                <button
                  type='button'
                  onClick={() => onDismiss(suggestion)}
                  disabled={isActioning}
                  className={cn(
                    'inline-flex items-center gap-1 p-1 text-xs rounded-md',
                    'text-secondary-token hover:bg-surface-2 hover:text-primary-token',
                    'disabled:opacity-50 transition-colors'
                  )}
                  aria-label={`Dismiss ${suggestion.platformLabel}`}
                >
                  {isActioning ? (
                    <Loader2 className='h-3 w-3 animate-spin' />
                  ) : (
                    <X className='h-3 w-3' />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
