'use client';

import { Check, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { useConfirmChatLinkMutation } from '@/lib/queries/useConfirmChatLinkMutation';
import { cn } from '@/lib/utils';

interface ChatLinkConfirmationCardProps {
  readonly profileId: string;
  readonly platform: {
    readonly id: string;
    readonly name: string;
    readonly icon: string;
    readonly color: string;
  };
  readonly normalizedUrl: string;
  readonly originalUrl: string;
}

type CardState = 'pending' | 'adding' | 'added' | 'dismissed';

export function ChatLinkConfirmationCard({
  profileId,
  platform,
  normalizedUrl,
  originalUrl,
}: ChatLinkConfirmationCardProps) {
  const [state, setState] = useState<CardState>('pending');
  const confirmLink = useConfirmChatLinkMutation();

  const handleAdd = useCallback(() => {
    setState('adding');
    confirmLink.mutate(
      {
        profileId,
        platform: platform.id,
        url: originalUrl,
        normalizedUrl,
      },
      {
        onSuccess: () => setState('added'),
        onError: () => setState('pending'),
      }
    );
  }, [profileId, platform.id, originalUrl, normalizedUrl, confirmLink]);

  const handleDismiss = useCallback(() => {
    setState('dismissed');
  }, []);

  if (state === 'added') {
    return (
      <div className='rounded-xl border border-success/30 bg-success-subtle p-4'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>
            {platform.name} link added
          </span>
        </div>
      </div>
    );
  }

  if (state === 'dismissed') {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 p-4 opacity-60'>
        <div className='flex items-center gap-2 text-secondary-token'>
          <X className='h-4 w-4' />
          <span className='text-sm'>Link dismissed</span>
        </div>
      </div>
    );
  }

  return (
    <div className='rounded-xl border border-accent/20 bg-accent/5 p-4'>
      <div className='flex items-center gap-3'>
        <SocialIcon
          platform={platform.icon}
          className='h-5 w-5 shrink-0'
          aria-hidden
        />
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-primary-token'>
            {platform.name}
          </p>
          <p className='truncate text-xs text-tertiary-token'>
            {normalizedUrl}
          </p>
        </div>
        <div className='flex items-center gap-1.5 shrink-0'>
          <button
            type='button'
            onClick={handleAdd}
            disabled={state === 'adding'}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium',
              'bg-accent text-on-accent hover:bg-accent/90',
              'disabled:opacity-50 transition-colors'
            )}
          >
            {state === 'adding' ? (
              <Loader2 className='h-3 w-3 animate-spin' />
            ) : (
              <Check className='h-3 w-3' />
            )}
            Add
          </button>
          <button
            type='button'
            onClick={handleDismiss}
            disabled={state === 'adding'}
            className={cn(
              'inline-flex items-center gap-1 rounded-md p-1.5 text-xs',
              'text-secondary-token hover:bg-surface-2 hover:text-primary-token',
              'disabled:opacity-50 transition-colors'
            )}
            aria-label={`Dismiss ${platform.name} link`}
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    </div>
  );
}
