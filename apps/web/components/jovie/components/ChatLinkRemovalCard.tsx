'use client';

import { Check, Loader2, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { usePreviewPanelContext } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { useConfirmChatRemoveLinkMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { CHAT_TOOL_CANCELLED_LABEL, ChatToolSurface } from './ChatToolSurface';

interface ChatLinkRemovalCardProps {
  readonly profileId: string;
  readonly linkId: string;
  readonly platform: string;
  readonly url: string;
}

type CardState = 'pending' | 'removing' | 'removed' | 'dismissed';

const VALID_SOCIAL_PLATFORMS = new Set([
  'spotify',
  'applemusic',
  'soundcloud',
  'bandcamp',
  'instagram',
  'twitter',
  'x',
  'tiktok',
  'youtube',
  'youtubemusic',
  'facebook',
  'discord',
  'reddit',
  'github',
  'patreon',
  'twitch',
  'linkedin',
  'snapchat',
  'pinterest',
  'threads',
  'mastodon',
  'bluesky',
  'link',
]);

function normalizeSocialPlatform(platform: string): string {
  const lower = platform.toLowerCase();
  return VALID_SOCIAL_PLATFORMS.has(lower) ? lower : 'link';
}

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

    // Optimistically drop the link from the live profile preview so the bento
    // updates immediately; restore the snapshot if the server rejects it.
    const snapshot = previewPanel?.previewData ?? null;
    if (snapshot) {
      previewPanel?.setPreviewData({
        ...snapshot,
        links: snapshot.links.filter(l => l.id !== linkId),
      });
    }

    removeLink.mutate(
      { profileId, linkId },
      {
        onSuccess: () => {
          setState('removed');
        },
        onError: () => {
          setState('pending');
          setErrorMessage('Unable to remove link. Please try again.');
          if (snapshot) {
            previewPanel?.setPreviewData(snapshot);
          }
        },
      }
    );
  }, [profileId, linkId, removeLink, previewPanel]);

  const handleDismiss = useCallback(() => {
    setState('dismissed');
  }, []);

  if (state === 'removed') {
    return (
      <ChatToolSurface tone='success'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>{platform} link removed</span>
        </div>
      </ChatToolSurface>
    );
  }

  if (state === 'dismissed') {
    return (
      <ChatToolSurface tone='cancelled'>
        <div className='flex items-center gap-2 text-secondary-token'>
          <X className='h-4 w-4' />
          <span className='text-sm'>{CHAT_TOOL_CANCELLED_LABEL}</span>
        </div>
      </ChatToolSurface>
    );
  }

  return (
    <ChatToolSurface className='system-b-chat-link-card system-b-chat-link-card-remove'>
      <div className='flex items-center gap-3'>
        <span className='system-b-chat-link-card-icon system-b-chat-link-card-icon-remove'>
          <SocialIcon
            platform={normalizeSocialPlatform(platform)}
            className='h-5 w-5 shrink-0'
            aria-hidden
          />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-primary-token'>
            Remove {platform}
          </p>
          <p className='truncate text-xs text-tertiary-token'>{url}</p>
          {errorMessage && (
            <output className='mt-1 block text-xs text-error'>
              {errorMessage}
            </output>
          )}
        </div>
        <div className='shrink-0 flex items-center gap-1.5'>
          <button
            type='button'
            onClick={handleRemove}
            disabled={state === 'removing'}
            className={cn(
              'system-b-chat-link-primary-action',
              'bg-error text-error-foreground hover:bg-error/90',
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
              'system-b-chat-link-dismiss-action',
              'text-secondary-token hover:bg-surface-0 hover:text-primary-token',
              'disabled:opacity-50 transition-colors'
            )}
            aria-label='Cancel Removal'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    </ChatToolSurface>
  );
}
