'use client';

import { Check, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { usePreviewPanelContext } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { LINEAR_SURFACE } from '@/components/features/dashboard/tokens';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useConfirmChatLinkMutation } from '@/lib/queries';
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
}: ChatLinkConfirmationCardProps) {
  const [state, setState] = useState<CardState>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmLink = useConfirmChatLinkMutation();
  const previewPanel = usePreviewPanelContext();

  const handleAdd = useCallback(() => {
    setErrorMessage(null);
    setState('adding');
    confirmLink.mutate(
      {
        profileId,
        platform: platform.id,
        url: originalUrl,
        normalizedUrl,
      },
      {
        onSuccess: () => {
          setState('added');

          // Instantly update sidebar preview with the new link
          if (previewPanel?.previewData) {
            previewPanel.setPreviewData({
              ...previewPanel.previewData,
              links: [
                ...previewPanel.previewData.links,
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
        },
        onError: () => {
          setState('pending');
          setErrorMessage('Unable to add link. Please try again.');
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
  ]);

  const handleDismiss = useCallback(() => {
    setState('dismissed');
  }, []);

  if (state === 'added') {
    return (
      <ContentSurfaceCard className='border-success/20 bg-[color-mix(in_oklab,var(--color-success)_8%,var(--linear-app-content-surface))] p-4'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>
            {platform.name} link added
          </span>
        </div>
      </ContentSurfaceCard>
    );
  }

  if (state === 'dismissed') {
    return (
      <ContentSurfaceCard className='border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] p-4 opacity-60'>
        <div className='flex items-center gap-2 text-secondary-token'>
          <X className='h-4 w-4' />
          <span className='text-sm'>Link dismissed</span>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className='border-accent/20 bg-[color-mix(in_oklab,var(--linear-accent)_8%,var(--linear-app-content-surface))] p-4'>
      <div className='flex items-center gap-3'>
        <span
          className={cn(
            LINEAR_SURFACE.drawerCardSm,
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border-accent/20 bg-[color-mix(in_oklab,var(--linear-accent)_10%,var(--linear-app-content-surface))]'
          )}
        >
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
              'inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-xs font-medium',
              'bg-accent text-accent-foreground hover:bg-accent/90',
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
              'inline-flex items-center gap-1 rounded-[8px] border border-transparent p-1.5 text-xs',
              'text-secondary-token hover:bg-surface-0 hover:text-primary-token',
              'disabled:opacity-50 transition-colors'
            )}
            aria-label={`Dismiss ${platform.name} link`}
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
