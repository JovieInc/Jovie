'use client';

import React, { useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import {
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  COUNTRY_CODE_COOKIE,
  LISTEN_COOKIE,
} from '@/constants/app';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import { track } from '@/lib/analytics';
import {
  type AvailableDSP,
  getAvailableDSPs,
  sortDSPsForDevice,
} from '@/lib/dsp';
import { useAppFlag } from '@/lib/flags/client';
import { detectPlatformFromUA } from '@/lib/utils';
import { Artist } from '@/types/db';
import type { ProfileRenderMode } from './contracts';

interface StaticListenInterfaceProps {
  readonly artist: Artist;
  readonly handle: string;
  readonly dspsOverride?: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly renderMode?: ProfileRenderMode;
}

/**
 * StaticListenInterface - DSP button list for the listen page.
 *
 * Performance optimizations:
 * - Removed DOMPurify (~70KB) - SVG logos are trusted internal constants from DSP_CONFIGS
 * - Removed backspace keyboard listener - non-standard UX and adds event overhead
 * - Lazy loads deep-links module only on click
 */
export const StaticListenInterface = React.memo(function StaticListenInterface({
  artist,
  handle,
  dspsOverride,
  enableDynamicEngagement = false,
  renderMode = 'interactive',
}: StaticListenInterfaceProps) {
  const enableDevicePriority = useAppFlag('IOS_APPLE_MUSIC_PRIORITY');

  const dsps = useMemo(() => {
    const countryCode =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find(cookie => cookie.trim().startsWith(`${COUNTRY_CODE_COOKIE}=`))
            ?.split('=')[1];

    const baseDSPs = dspsOverride ?? getAvailableDSPs(artist);
    const userAgent =
      typeof navigator === 'undefined' ? undefined : navigator.userAgent;
    const detectedPlatform = detectPlatformFromUA(userAgent);
    const platform =
      detectedPlatform === 'ios' || detectedPlatform === 'android'
        ? detectedPlatform
        : 'desktop';

    return sortDSPsForDevice(baseDSPs, {
      countryCode: countryCode ?? null,
      platform,
      enableDevicePriority,
    });
  }, [artist, dspsOverride, enableDevicePriority]);
  const [selectedDSP, setSelectedDSP] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const availableDSPs = dsps;

  // NOTE: SVG logos from DSP_CONFIGS are trusted internal constants (not user content).
  // No sanitization needed - this removes the ~70KB isomorphic-dompurify dependency.

  const handleDSPClick = async (dsp: AvailableDSP) => {
    if (renderMode !== 'interactive') {
      return;
    }

    if (isLoading) return;

    setIsLoading(true);
    setSelectedDSP(dsp.key);

    try {
      // Save preference
      document.cookie = `${LISTEN_COOKIE}=${dsp.key}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

      if (enableDynamicEngagement && dsp.key === 'spotify') {
        document.cookie = `${AUDIENCE_SPOTIFY_PREFERRED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      }
      try {
        localStorage.setItem(LISTEN_COOKIE, dsp.key);
      } catch (error) {
        console.error(
          '[StaticListenInterface] Failed to set localStorage:',
          error
        );
      }

      // Track click (non-blocking)
      try {
        track('listen_click', {
          handle,
          linkType: 'listen',
          platform: dsp.key,
        });
      } catch (error) {
        console.error('[StaticListenInterface] Failed to track click:', error);
      }

      // Try deep linking with lazy import
      try {
        const { getDSPDeepLinkConfig, openDeepLink } = await import(
          '@/lib/deep-links'
        );
        const deepLinkConfig = getDSPDeepLinkConfig(dsp.key);

        if (deepLinkConfig) {
          try {
            await openDeepLink(dsp.url, deepLinkConfig);
          } catch (error) {
            console.debug('Deep link failed, using fallback:', error);
            globalThis.open(dsp.url, '_blank', 'noopener,noreferrer');
          }
        } else {
          globalThis.open(dsp.url, '_blank', 'noopener,noreferrer');
        }
      } catch (error) {
        console.debug(
          'Deep link module failed to load, using fallback:',
          error
        );
        globalThis.open(dsp.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Failed to handle DSP click:', error);
    } finally {
      // Reset selection after a delay
      setTimeout(() => {
        setSelectedDSP(null);
        setIsLoading(false);
      }, 1000);
    }
  };

  const isPreview = renderMode === 'preview';

  return (
    <div className='w-full max-w-sm'>
      {/* DSP Buttons */}
      <div className='space-y-3'>
        {availableDSPs.length === 0 ? (
          <div className='rounded-2xl border border-subtle bg-surface-1 p-5 shadow-sm text-center'>
            <p className='text-sm text-secondary-token'>
              Streaming links aren&apos;t available for this profile yet.
            </p>
          </div>
        ) : (
          availableDSPs.map(dsp => {
            const logoConfig =
              DSP_LOGO_CONFIG[dsp.key as keyof typeof DSP_LOGO_CONFIG];
            const isSelected = selectedDSP === dsp.key;

            let buttonClassName: string | undefined;
            if (isPreview) buttonClassName = 'pointer-events-none opacity-88';
            else if (isSelected || isLoading) buttonClassName = 'opacity-60';

            return (
              <SmartLinkProviderButton
                key={dsp.key}
                onClick={() => {
                  void handleDSPClick(dsp);
                }}
                label={isSelected ? `Opening ${dsp.name}...` : dsp.name}
                iconPath={logoConfig?.iconPath}
                className={buttonClassName}
              />
            );
          })
        )}
      </div>

      {/* Help text */}
      <div className='mt-6 text-center'>
        <p className='text-xs text-tertiary-token'>
          Your preferred app opens first next time.
        </p>
      </div>
    </div>
  );
});
