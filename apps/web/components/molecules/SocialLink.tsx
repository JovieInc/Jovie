'use client';

import { memo } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import type { LegacySocialLink as SocialLinkType } from '@/types/db';

interface SocialLinkProps {
  readonly link: SocialLinkType;
  readonly handle: string;
  readonly artistName: string;
}

function SocialLinkComponent({ link, handle, artistName }: SocialLinkProps) {
  // Guard against incomplete link data
  if (!link.platform || !link.url) {
    return null;
  }
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    // Track analytics first
    track('social_click', {
      handle,
      artist: artistName,
      platform: link.platform,
      url: link.url,
    });

    // Fire-and-forget server tracking
    fetch('/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        handle,
        linkType: 'social',
        target: link.platform,
        linkId: link.id,
      }),
    }).catch(() => {
      // Ignore tracking errors
    });

    // Try deep linking
    const deepLinkConfig = getSocialDeepLinkConfig(link.platform);

    if (deepLinkConfig) {
      try {
        await openDeepLink(link.url, deepLinkConfig, {
          onNativeAttempt: () => {
            // Optional: could add loading state here
          },
          onFallback: () => {
            // Optional: could track fallback usage
          },
        });
      } catch (error) {
        console.debug('Deep link failed, using fallback:', error);
        globalThis.open(link.url, '_blank', 'noopener,noreferrer');
      }
    } else {
      // No deep link config, use original URL
      globalThis.open(link.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <a
      href={link.url}
      onClick={handleClick}
      className='group flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-transparent text-secondary-token transition-colors hover:border-subtle hover:bg-surface-2 hover:text-primary-token cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
      title={`Follow on ${link.platform}`}
      aria-label={`Follow ${artistName} on ${link.platform}`}
    >
      <SocialIcon platform={link.platform} className='h-4 w-4' />
    </a>
  );
}

export const SocialLink = memo(SocialLinkComponent);
SocialLink.displayName = 'SocialLink';
