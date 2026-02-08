'use client';

/**
 * ProviderIcon - Streaming provider icons using SocialIcon.
 *
 * Uses SocialIcon for consistent branding and centralized icon loading.
 */

import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { ProviderKey } from '@/lib/discography/types';

interface ProviderIconProps {
  readonly provider: ProviderKey;
  readonly className?: string;
}

const PROVIDER_PLATFORM_MAP: Record<ProviderKey, string> = {
  spotify: 'spotify',
  apple_music: 'applemusic',
  youtube: 'youtube',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'website',
  bandcamp: 'bandcamp',
  beatport: 'website',
};

export function ProviderIcon({
  provider,
  className = 'h-5 w-5',
}: ProviderIconProps) {
  return (
    <SocialIcon
      platform={PROVIDER_PLATFORM_MAP[provider]}
      className={className}
      aria-hidden='true'
    />
  );
}
