'use client';

import { memo } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import { useTrackingMutation } from '@/lib/queries';
import {
  publicLinkAriaLabel,
  sanitizePublicHref,
} from '@/lib/utils/public-url';
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

  const href = sanitizePublicHref(link.url);
  // Guard against incomplete or malformed link data
  if (!link.platform || !href) {
    return null;
  }
  const platformLabel =
    link.platform.charAt(0).toUpperCase() + link.platform.slice(1);
  const accessibleName = publicLinkAriaLabel(
    artistName,
    link.platform,
    platformLabel
  );
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    // Track analytics first
    track('social_click', {
      handle,
      artist: artistName,
      platform: link.platform,
      url: href,
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
        await openDeepLink(href, deepLinkConfig, {
          onNativeAttempt: () => {
            // Optional: could add loading state here
          },
          onFallback: () => {
            // Optional: could track fallback usage
          },
        });
      } catch (error) {
        console.debug('Deep link failed, using fallback:', error);
        globalThis.open(href, '_blank', 'noopener,noreferrer');
      }
    } else {
      // No deep link config, use original URL
      globalThis.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <CircleIconButton
      asChild
      size='md'
      variant='pearl'
      ariaLabel={accessibleName}
      className='text-primary-token/72 shadow-none hover:text-primary-token'
    >
      <a
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        onClick={handleClick}
        title={accessibleName}
      >
        <SocialIcon platform={link.platform} className='h-4 w-4' />
      </a>
    </CircleIconButton>
  );
}

export const SocialLink = memo(SocialLinkComponent);
SocialLink.displayName = 'SocialLink';
