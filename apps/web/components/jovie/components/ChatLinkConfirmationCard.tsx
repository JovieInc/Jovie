'use client';

import { Button } from '@jovie/ui';
import { Check, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { usePreviewPanelContext } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  dismissProposal,
  isProposalDismissed,
  undismissProposal,
} from '@/lib/chat/proposal-dismiss-ledger';
import { useConfirmChatLinkMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { CHAT_TOOL_CANCELLED_LABEL, ChatToolSurface } from './ChatToolSurface';

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
  /** Stable tool call id for durable dismiss/undo ledger (JOV-3549). */
  readonly toolCallId?: string;
}

type CardState = 'pending' | 'adding' | 'added' | 'updated' | 'dismissed';

/** Canonical SocialIcon platform values. Falls back to 'link' for unknown platforms. */
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

function normalizeSocialPlatform(icon: string): string {
  const lower = icon.toLowerCase();
  return VALID_SOCIAL_PLATFORMS.has(lower) ? lower : 'link';
}

export function ChatLinkConfirmationCard({
  profileId,
  platform,
  normalizedUrl,
  originalUrl,
  toolCallId,
}: ChatLinkConfirmationCardProps) {
  const [state, setState] = useState<CardState>(() =>
    isProposalDismissed(toolCallId) ? 'dismissed' : 'pending'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmLink = useConfirmChatLinkMutation();
  const previewPanel = usePreviewPanelContext();

  const handleAdd = useCallback(() => {
    setErrorMessage(null);
    setState('adding');

    // Optimistically add the link to the live profile preview so the bento
    // updates the instant the user confirms; roll back to the snapshot on error.
    const snapshot = previewPanel?.previewData ?? null;
    if (snapshot) {
      previewPanel?.setPreviewData({
        ...snapshot,
        links: [
          ...snapshot.links,
          {
            id: `chat-link-${Date.now()}`,
            title: platform.name,
            url: normalizedUrl,
            platform: platform.id,
            isVisible: true,
          },
        ],
      });
    }

    confirmLink.mutate(
      {
        profileId,
        platform: platform.id,
        url: originalUrl,
        normalizedUrl,
      },
      {
        onSuccess: data => {
          undismissProposal(toolCallId);
          setState(data.outcome === 'updated' ? 'updated' : 'added');
        },
        onError: () => {
          setState('pending');
          setErrorMessage('Unable to add link. Please try again.');
          if (snapshot) {
            previewPanel?.setPreviewData(snapshot);
          }
        },
      }
    );
  }, [
    profileId,
    platform,
    originalUrl,
    normalizedUrl,
    confirmLink,
    previewPanel,
    toolCallId,
  ]);

  const handleDismiss = useCallback(() => {
    dismissProposal(toolCallId);
    setState('dismissed');
  }, [toolCallId]);

  const handleUndoDismiss = useCallback(() => {
    undismissProposal(toolCallId);
    setState('pending');
  }, [toolCallId]);

  if (state === 'added' || state === 'updated') {
    return (
      <ChatToolSurface tone='success'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>
            {state === 'updated'
              ? `${platform.name} link updated`
              : `${platform.name} link added`}
          </span>
        </div>
      </ChatToolSurface>
    );
  }

  if (state === 'dismissed') {
    return (
      <ChatToolSurface tone='cancelled'>
        <div className='flex items-center justify-between gap-2 text-secondary-token'>
          <div className='flex items-center gap-2'>
            <X className='h-4 w-4' />
            <span className='text-sm'>{CHAT_TOOL_CANCELLED_LABEL}</span>
          </div>
          <Button
            type='button'
            variant='link'
            size='sm'
            onClick={handleUndoDismiss}
            className='h-auto px-0 text-xs font-medium text-primary-token underline-offset-2'
            data-testid='chat-link-dismiss-undo'
          >
            Undo
          </Button>
        </div>
      </ChatToolSurface>
    );
  }

  return (
    <ChatToolSurface className='system-b-chat-link-card system-b-chat-link-card-add'>
      <div className='flex items-center gap-3'>
        <span className='system-b-chat-link-card-icon system-b-chat-link-card-icon-add'>
          <SocialIcon
            platform={normalizeSocialPlatform(platform.icon)}
            className='h-5 w-5 shrink-0'
            aria-hidden
          />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-primary-token'>
            {platform.name}
          </p>
          <p className='truncate text-xs text-tertiary-token'>
            {normalizedUrl}
          </p>
          {errorMessage && (
            <output className='mt-1 block text-xs text-danger-token'>
              {errorMessage}
            </output>
          )}
        </div>
        <div className='shrink-0 flex items-center gap-1.5'>
          <button
            type='button'
            onClick={handleAdd}
            disabled={state === 'adding'}
            className={cn(
              'system-b-chat-link-primary-action',
              'border border-(--linear-btn-primary-border) bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover',
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
              'system-b-chat-link-dismiss-action',
              'text-secondary-token hover:bg-surface-0 hover:text-primary-token',
              'disabled:opacity-50 transition-colors'
            )}
            aria-label={`Dismiss ${platform.name} link`}
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    </ChatToolSurface>
  );
}
