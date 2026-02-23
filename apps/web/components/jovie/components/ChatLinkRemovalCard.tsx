'use client';

import { Check, Loader2, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { usePreviewPanelContext } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { useConfirmChatRemoveLinkMutation } from '@/lib/queries/useConfirmChatRemoveLinkMutation';
import { cn } from '@/lib/utils';

interface ChatLinkRemovalCardProps {
  readonly profileId: string;
  readonly linkId: string;
  readonly platform: string;
  readonly url: string;
}

type CardState = 'pending' | 'removing' | 'removed' | 'dismissed';

export function ChatLinkRemovalCard({
  profileId,
  linkId,
  platform,
  url,
}: ChatLinkRemovalCardProps) {
  const [state, setState] = useState<CardState>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const removeLink = useConfirmChatRemoveLinkMutation();
  const previewPanel = usePreviewPanelContext();

  const handleRemove = useCallback(() => {
    setErrorMessage(null);
    setState('removing');
    removeLink.mutate(
      { profileId, linkId },
      {
        onSuccess: () => {
          setState('removed');

          // Instantly update sidebar preview by removing the link
          if (previewPanel?.previewData) {
            previewPanel.setPreviewData({
              ...previewPanel.previewData,
              links: previewPanel.previewData.links.filter(
                l => l.id !== linkId
              ),
            });
          }
        },
        onError: () => {
          setState('pending');
          setErrorMessage('Unable to remove link. Please try again.');
        },
      }
    );
  }, [profileId, linkId, removeLink, previewPanel]);

  const handleDismiss = useCallback(() => {
    setState('dismissed');
  }, []);

  if (state === 'removed') {
    return (
      <div className='rounded-xl border border-success/30 bg-success-subtle p-4'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>{platform} link removed</span>
        </div>
      </div>
    );
  }

  if (state === 'dismissed') {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 p-4 opacity-60'>
        <div className='flex items-center gap-2 text-secondary-token'>
          <X className='h-4 w-4' />
          <span className='text-sm'>Removal cancelled</span>
        </div>
      </div>
    );
  }

  return (
    <div className='rounded-xl border border-error/20 bg-error/5 p-4'>
      <div className='flex items-center gap-3'>
        <SocialIcon
          platform={platform.toLowerCase()}
          className='h-5 w-5 shrink-0'
          aria-hidden
        />
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-primary-token'>
            Remove {platform}
          </p>
          <p className='truncate text-xs text-tertiary-token'>{url}</p>
          {errorMessage && (
            <output className='mt-1 block text-xs text-danger-token'>
              {errorMessage}
            </output>
          )}
        </div>
        <div className='flex items-center gap-1.5 shrink-0'>
          <button
            type='button'
            onClick={handleRemove}
            disabled={state === 'removing'}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium',
              'bg-error text-white hover:bg-error/90',
              'disabled:opacity-50 transition-colors'
            )}
          >
            {state === 'removing' ? (
              <Loader2 className='h-3 w-3 animate-spin' />
            ) : (
              <Trash2 className='h-3 w-3' />
            )}
            Remove
          </button>
          <button
            type='button'
            onClick={handleDismiss}
            disabled={state === 'removing'}
            className={cn(
              'inline-flex items-center gap-1 rounded-md p-1.5 text-xs',
              'text-secondary-token hover:bg-surface-2 hover:text-primary-token',
              'disabled:opacity-50 transition-colors'
            )}
            aria-label='Cancel removal'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    </div>
  );
}
