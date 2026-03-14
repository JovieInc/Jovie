'use client';

/**
 * ProviderIcon - Streaming provider icons using SocialIcon.
 *
 * Uses SocialIcon for consistent branding and centralized icon loading.
 */

import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getContrastSafeIconColor } from '@/lib/utils/color';

interface ProviderIconProps {
  readonly provider: ProviderKey;
  readonly className?: string;
  readonly 'aria-label'?: string;
}

const PROVIDER_PLATFORM_MAP: Record<ProviderKey, string> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube',
  youtube_music: 'youtube_music',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: 'bandcamp',
  beatport: 'beatport',
  pandora: 'pandora',
  napster: 'napster',
  audiomack: 'audiomack',
  qobuz: 'qobuz',
  anghami: 'anghami',
  boomplay: 'boomplay',
  iheartradio: 'iheartradio',
  tiktok: 'tiktok',
};

export function ProviderIcon({
  provider,
  className = 'h-5 w-5',
  'aria-label': ariaLabel,
}: ProviderIconProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const brandColor = PROVIDER_CONFIG[provider].accent;
  const isDark = mounted ? resolvedTheme === 'dark' : false;
  const color = useMemo(
    () => getContrastSafeIconColor(brandColor, isDark),
    [brandColor, isDark]
  );

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        className
      )}
      style={{ color }}
    >
      <SocialIcon
        platform={PROVIDER_PLATFORM_MAP[provider]}
        className='h-full w-full'
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
      />
    </span>
  );
}
