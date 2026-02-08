'use client';

import { useTheme } from 'next-themes';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { cn } from '@/lib/utils';
import { ensureContrast, isBrandDark } from '@/lib/utils/color';

export interface DspProviderIconProps {
  readonly provider: DspProviderId;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly showLabel?: boolean;
}

const PROVIDER_LABELS: Record<DspProviderId, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  deezer: 'Deezer',
  youtube_music: 'YouTube Music',
  tidal: 'Tidal',
  soundcloud: 'SoundCloud',
  amazon_music: 'Amazon Music',
  musicbrainz: 'MusicBrainz',
};

const PROVIDER_COLORS: Record<DspProviderId, string> = {
  spotify: '#1DB954',
  apple_music: '#FA243C',
  deezer: '#FEAA2D',
  youtube_music: '#FF0000',
  tidal: '#000000',
  soundcloud: '#FF5500',
  amazon_music: '#00A8E1',
  musicbrainz: '#BA478F',
};

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

/**
 * DspProviderIcon - Displays a DSP provider icon with optional label.
 *
 * Uses the existing SocialIcon component but provides DSP-specific
 * configuration and consistent sizing.
 */
export function DspProviderIcon({
  provider,
  size = 'md',
  className,
  showLabel = false,
}: DspProviderIconProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const label = PROVIDER_LABELS[provider];
  const rawColor = PROVIDER_COLORS[provider];
  // Ensure brand color meets WCAG 3:1 non-text contrast.
  // Dark brands (Tidal) → white in dark mode; bright brands → darkened in light mode.
  const bgHex = isDark ? '#101012' : '#fcfcfc';
  const color =
    isDark && isBrandDark(rawColor)
      ? '#ffffff'
      : ensureContrast(rawColor, bgHex);

  // Map DSP provider IDs to SocialIcon platform names
  const platformMap: Record<DspProviderId, string> = {
    spotify: 'spotify',
    apple_music: 'apple_music',
    deezer: 'deezer',
    youtube_music: 'youtube',
    tidal: 'tidal',
    soundcloud: 'soundcloud',
    amazon_music: 'amazon',
    musicbrainz: 'website', // Fallback icon for MusicBrainz
  };

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={label}
    >
      <span style={{ color }}>
        <SocialIcon
          platform={platformMap[provider]}
          className={SIZE_CLASSES[size]}
          aria-label={label}
        />
      </span>
      {showLabel && (
        <span className='text-xs font-medium text-secondary-token'>
          {label}
        </span>
      )}
    </span>
  );
}

export { PROVIDER_LABELS, PROVIDER_COLORS };
