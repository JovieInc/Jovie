'use client';

import { memo } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import { useTrackingMutation } from '@/lib/queries';
import type { LegacySocialLink as SocialLinkType } from '@/types/db';

interface SocialLinkProps {
  readonly link: SocialLinkType;
  readonly handle: string;
  readonly artistName: string;
}

function SocialLinkComponent({ link, handle, artistName }: SocialLinkProps) {
  const trackSocialClick = useTrackingMutation({
    endpoint: '/api/track',
  });

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
    trackSocialClick.mutate({
      handle,
      linkType: 'social',
      target: link.platform,
      linkId: link.id,
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
      target='_blank'
      rel='noopener noreferrer'
      onClick={handleClick}
      className='group flex h-11 min-w-11 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] text-secondary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[background-color,border-color,color,transform] hover:border-white/14 hover:bg-white/[0.08] hover:text-primary-token active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
      title={`Follow on ${link.platform}`}
      aria-label={`Follow ${artistName} on ${link.platform}`}
    >
      <SocialIcon platform={link.platform} className='h-4 w-4' />
    </a>
  );
}

export const SocialLink = memo(SocialLinkComponent);
SocialLink.displayName = 'SocialLink';
