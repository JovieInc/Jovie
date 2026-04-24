'use client';

import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { DSP_PROVIDER_IDS } from '@/lib/dsp-provider-metadata';
import { DSP_REGISTRY } from '@/lib/dsp-registry';
import { cn } from '@/lib/utils';
import { getContrastSafeIconColor } from '@/lib/utils/color';

export interface DspProviderIconProps {
  readonly provider: DspProviderId;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly showLabel?: boolean;
}

const PROVIDER_LABELS: Record<DspProviderId, string> = DSP_PROVIDER_IDS.reduce(
  (acc, providerId) => {
    const entry = DSP_REGISTRY.find(item => item.key === providerId);
    if (entry) {
      acc[providerId] = entry.name;
    }
    return acc;
  },
  {} as Record<DspProviderId, string>
);

const PROVIDER_COLORS: Record<DspProviderId, string> = DSP_PROVIDER_IDS.reduce(
  (acc, providerId) => {
    const entry = DSP_REGISTRY.find(item => item.key === providerId);
    if (entry) {
      acc[providerId] = entry.color;
    }
    return acc;
  },
  {} as Record<DspProviderId, string>
);

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

/** Providers that have a dedicated ProviderIcon (streaming DSPs) */
const DSP_PROVIDER_MAP: Partial<
  Record<
    DspProviderId,
    Exclude<DspProviderId, 'musicbrainz' | 'genius' | 'discogs' | 'allmusic'>
  >
> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  deezer: 'deezer',
  youtube_music: 'youtube_music',
  tidal: 'tidal',
  soundcloud: 'soundcloud',
  amazon_music: 'amazon_music',
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : false;
  const label = PROVIDER_LABELS[provider];
  const rawColor = PROVIDER_COLORS[provider];
  // Ensure brand color meets WCAG 3:1 non-text contrast.
  // Dark brands (Tidal) → white in dark mode; bright brands → darkened in light mode.
  const color = useMemo(
    () => getContrastSafeIconColor(rawColor, isDark),
    [isDark, rawColor]
  );

  const mappedProvider = DSP_PROVIDER_MAP[provider];

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={label}
    >
      {mappedProvider ? (
        <ProviderIcon
          provider={mappedProvider}
          className={SIZE_CLASSES[size]}
          aria-label={label}
        />
      ) : (
        <span style={{ color }}>
          <SocialIcon
            platform={provider}
            className={SIZE_CLASSES[size]}
            aria-label={label}
          />
        </span>
      )}
      {showLabel && (
        <span className='text-app font-caption text-secondary-token'>
          {label}
        </span>
      )}
    </span>
  );
}

export { PROVIDER_COLORS, PROVIDER_LABELS };
