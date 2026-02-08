'use client';

import { useTheme } from 'next-themes';
import { memo, useMemo, useState } from 'react';
import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import { getSocialDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import { ensureContrast, hexToRgba, isBrandDark } from '@/lib/utils/color';
import type { LegacySocialLink as SocialLinkType } from '@/types/db';

interface SocialLinkProps {
  readonly link: SocialLinkType;
  readonly handle: string;
  readonly artistName: string;
}

function SocialLinkComponent({ link, handle, artistName }: SocialLinkProps) {
  // Hooks must be called unconditionally (before any early returns)
  const [hover, setHover] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const brandHex = useMemo(
    () => getPlatformIconMetadata(link.platform ?? '')?.hex,
    [link.platform]
  );

  // Ensure brand color meets WCAG 3:1 non-text contrast against the hover
  // background. Dark brands (TikTok, X) are inverted to white in dark mode;
  // bright brands (Snapchat, Rumble) are darkened in light mode.
  const hoverColor = useMemo(() => {
    if (!brandHex) return undefined;
    if (isDark && isBrandDark(brandHex)) return '#ffffff';
    // surface-1 light = #fcfcfc, dark = #101012
    const hoverBg = isDark ? '#101012' : '#fcfcfc';
    return ensureContrast(brandHex, hoverBg);
  }, [brandHex, isDark]);

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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={`group flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 cursor-pointer border backdrop-blur-sm ${
        hover ? 'border-default bg-surface-1' : 'border-subtle bg-surface-0/80'
      } text-secondary-token`}
      style={
        hoverColor && hover
          ? {
              color: hoverColor,
              boxShadow: `0 0 0 1px ${hexToRgba(brandHex!, 0.3)}, 0 4px 12px -4px ${hexToRgba(brandHex!, 0.4)}`,
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

export const SocialLink = memo(SocialLinkComponent);
SocialLink.displayName = 'SocialLink';
