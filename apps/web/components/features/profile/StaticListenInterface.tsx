'use client';

import { motion } from 'motion/react';
import React, { useMemo, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import {
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  COUNTRY_CODE_COOKIE,
  LISTEN_COOKIE,
} from '@/constants/app';
import { track } from '@/lib/analytics';
import {
  type AvailableDSP,
  getAvailableDSPs,
  sortDSPsForDevice,
} from '@/lib/dsp';
import { useCodeFlag } from '@/lib/feature-flags/client';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { detectPlatformFromUA } from '@/lib/utils';
import { Artist } from '@/types/db';

const MAX_STAGGER_ITEMS = 6;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.04,
      delayChildren: 0.08,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
} as const;

interface StaticListenInterfaceProps {
  readonly artist: Artist;
  readonly handle: string;
  readonly dspsOverride?: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
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
}: StaticListenInterfaceProps) {
  const enableDevicePriority = useCodeFlag('IOS_APPLE_MUSIC_PRIORITY');
  const prefersReducedMotion = useReducedMotion();

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

  const MotionContainer = prefersReducedMotion ? 'div' : motion.div;
  const MotionItem = prefersReducedMotion ? 'div' : motion.div;

  return (
    <div className='w-full max-w-sm'>
      {availableDSPs.length === 0 ? (
        <div className='rounded-2xl border border-subtle bg-surface-1 p-5 shadow-sm text-center'>
          <p className='text-sm text-secondary-token'>
            Streaming links aren&apos;t available for this profile yet.
          </p>
        </div>
      ) : (
        <MotionContainer
          className='divide-y divide-white/[0.08]'
          {...(prefersReducedMotion
            ? {}
            : {
                variants: containerVariants,
                initial: 'hidden',
                animate: 'visible',
              })}
        >
          {availableDSPs.map((dsp, index) => {
            const logoConfig =
              DSP_LOGO_CONFIG[dsp.key as keyof typeof DSP_LOGO_CONFIG];
            const isSelected = selectedDSP === dsp.key;

            return (
              <MotionItem
                key={dsp.key}
                {...(prefersReducedMotion
                  ? {}
                  : {
                      variants: itemVariants,
                      custom: index,
                      style:
                        index >= MAX_STAGGER_ITEMS
                          ? {
                              transitionDelay: `${MAX_STAGGER_ITEMS * 0.04 + 0.08}s`,
                            }
                          : undefined,
                    })}
              >
                <button
                  type='button'
                  onClick={() => handleDSPClick(dsp)}
                  className={`group flex w-full items-center gap-3.5 px-1 py-3 transition-colors duration-100 active:bg-white/[0.06] ${isSelected || isLoading ? 'opacity-60' : ''}`}
                  aria-label={`Open ${dsp.name}`}
                >
                  <span
                    className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full'
                    style={{ backgroundColor: logoConfig?.color ?? '#666' }}
                  >
                    {logoConfig?.iconPath ? (
                      <svg
                        viewBox='0 0 24 24'
                        fill='white'
                        className='h-3.5 w-3.5'
                        aria-hidden='true'
                      >
                        <path d={logoConfig.iconPath} />
                      </svg>
                    ) : null}
                  </span>
                  <span className='flex-1 text-left text-[15px] font-[450] text-white'>
                    {isSelected ? `Opening ${dsp.name}...` : dsp.name}
                  </span>
                  <svg
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                    className='h-4 w-4 text-white/30'
                    aria-hidden='true'
                  >
                    <path
                      d='m9 18 6-6-6-6'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    />
                  </svg>
                </button>
              </MotionItem>
            );
          })}
        </MotionContainer>
      )}

      <div className='mt-6 text-center'>
        <p className='text-xs text-tertiary-token'>
          Your preferred app opens first next time.
        </p>
      </div>
    </div>
  );
});
