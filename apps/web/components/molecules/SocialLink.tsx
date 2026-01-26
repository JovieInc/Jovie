'use client';

import { memo, useMemo, useState } from 'react';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import { hexToRgba } from '@/lib/utils/color';
import type { LegacySocialLink as SocialLinkType } from '@/types/db';

interface SocialLinkProps {
  link: SocialLinkType;
  handle: string;
  artistName: string;
}

export const SocialLink = memo(function SocialLink({
  link,
  handle,
  artistName,
}: SocialLinkProps) {
  // Guard against incomplete link data
  if (!link.platform || !link.url) {
    return null;
  }

  const [hover, setHover] = useState(false);
  const brandHex = useMemo(
    () => getPlatformIcon(link.platform)?.hex,
    [link.platform]
  );
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
        window.open(link.url, '_blank', 'noopener,noreferrer');
      }
    } else {
      // No deep link config, use original URL
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <a
      href={link.url}
      onClick={e => handleClick(e)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={`group flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 cursor-pointer border backdrop-blur-sm ${
        hover
          ? 'border-neutral-400 dark:border-neutral-500 bg-white dark:bg-neutral-700'
          : 'border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80'
      } text-neutral-700 dark:text-neutral-200`}
      style={
        brandHex && hover
          ? {
              color: `#${brandHex}`,
              boxShadow: `0 0 0 1px ${hexToRgba(brandHex, 0.3)}, 0 4px 12px -4px ${hexToRgba(brandHex, 0.4)}`,
            }
          : undefined
      }
      title={`Follow on ${link.platform}`}
      aria-label={`Follow ${artistName} on ${link.platform}`}
    >
      <SocialIcon platform={link.platform} className='h-4 w-4' />
    </a>
  );
});
