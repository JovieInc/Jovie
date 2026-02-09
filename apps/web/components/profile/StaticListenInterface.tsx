'use client';

import React, { useState } from 'react';
import {
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  LISTEN_COOKIE,
} from '@/constants/app';
import { track } from '@/lib/analytics';
import { AvailableDSP, getAvailableDSPs } from '@/lib/dsp';
import { Artist } from '@/types/db';

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
  const [dsps] = useState<AvailableDSP[]>(
    () => dspsOverride ?? getAvailableDSPs(artist)
  );
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

  return (
    <div className='w-full max-w-sm'>
      {/* DSP Buttons */}
      <div className='space-y-3'>
        {availableDSPs.length === 0 ? (
          <div className='bg-surface-0 backdrop-blur-sm border border-subtle rounded-xl p-6 shadow-sm text-center'>
            <p className='text-sm text-secondary-token'>
              Streaming links haven&apos;t been added to this profile yet. Check
              back soon!
            </p>
          </div>
        ) : (
          availableDSPs.map(dsp => (
            <button
              type='button'
              key={dsp.key}
              onClick={() => handleDSPClick(dsp)}
              disabled={selectedDSP === dsp.key || isLoading}
              className={`
                w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-medium text-[15px]
                transition-all duration-150 ease-out will-change-transform
                hover:scale-[1.01] hover:-translate-y-px active:scale-[0.99]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opacity-50
                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                ${selectedDSP === dsp.key ? 'opacity-75 cursor-wait' : ''}
              `}
              style={{
                backgroundColor: dsp.config.color,
                color: dsp.config.textColor,
              }}
              aria-label={`Open in ${dsp.name} app if installed, otherwise opens in web browser`}
            >
              <div
                className='shrink-0'
                // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG logos are trusted internal constants from DSP_CONFIGS, not user content
                dangerouslySetInnerHTML={{ __html: dsp.config.logoSvg }}
              />
              <span>
                {selectedDSP === dsp.key ? 'Opening...' : `Open in ${dsp.name}`}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Help text */}
      <div className='mt-6 text-center'>
        <p className='text-xs text-tertiary-token'>
          If you have the app installed, it will open automatically
        </p>
      </div>
    </div>
  );
});
