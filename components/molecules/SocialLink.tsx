'use client';

import { useMemo, useState } from 'react';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import type { LegacySocialLink as SocialLinkType } from '@/types/db';

interface SocialLinkProps {
  link: SocialLinkType;
  handle: string;
  artistName: string;
}

export function SocialLink({ link, handle, artistName }: SocialLinkProps) {
  const [hover, setHover] = useState(false);
  const brandHex = useMemo(
    () => getPlatformIcon(link.platform)?.hex,
    [link.platform]
  );
  const hexToRgba = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
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
      className='group flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 cursor-pointer ring-1 ring-black/5 dark:ring-white/10'
      style={
        brandHex
          ? {
              color: `#${brandHex}`,
              backgroundColor: hexToRgba(brandHex, 0.12),
              boxShadow: hover
                ? `0 0 0 0.5px ${hexToRgba(brandHex, 0.6)}, 0 10px 24px -12px ${hexToRgba(brandHex, 0.6)}`
                : undefined,
            }
          : undefined
      }
      title={`Follow on ${link.platform}`}
      aria-label={`Follow ${artistName} on ${link.platform}`}
    >
      <SocialIcon platform={link.platform} className='h-4 w-4' />
    </a>
  );
}
