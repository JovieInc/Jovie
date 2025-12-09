'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
// Lazy import deep links to avoid loading heavy code upfront
import { LISTEN_COOKIE } from '@/constants/app';
import { track } from '@/lib/analytics';
import { AvailableDSP, getAvailableDSPs } from '@/lib/dsp';
import { Artist } from '@/types/db';

interface StaticListenInterfaceProps {
  artist: Artist;
  handle: string;
  dspsOverride?: AvailableDSP[];
}

export const StaticListenInterface = React.memo(function StaticListenInterface({
  artist,
  handle,
  dspsOverride,
}: StaticListenInterfaceProps) {
  const [dsps] = useState<AvailableDSP[]>(
    () => dspsOverride ?? getAvailableDSPs(artist)
  );
  const [selectedDSP, setSelectedDSP] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const availableDSPs = dsps;

  // Handle backspace key to go back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        // Only trigger if not in an input field
        const target = event.target as HTMLElement;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        router.push(`/${handle}`);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handle, router]);

  const handleDSPClick = async (dsp: AvailableDSP) => {
    if (isLoading) return;

    setIsLoading(true);
    setSelectedDSP(dsp.key);

    try {
      // Save preference
      document.cookie = `${LISTEN_COOKIE}=${dsp.key}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      try {
        localStorage.setItem(LISTEN_COOKIE, dsp.key);
      } catch {}

      // Track click (non-blocking)
      try {
        track('listen_button_click', {
          handle,
          linkType: 'listen',
          target: dsp.key,
        });
      } catch {}

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
            window.open(dsp.url, '_blank', 'noopener,noreferrer');
          }
        } else {
          window.open(dsp.url, '_blank', 'noopener,noreferrer');
        }
      } catch (error) {
        console.debug(
          'Deep link module failed to load, using fallback:',
          error
        );
        window.open(dsp.url, '_blank', 'noopener,noreferrer');
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
          <div className='bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-gray-200/30 dark:border-white/10 rounded-2xl p-8 shadow-xl shadow-black/5 text-center'>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              Streaming links aren&apos;t available for this profile yet.
            </p>
          </div>
        ) : (
          availableDSPs.map(dsp => (
            <button
              key={dsp.key}
              onClick={() => handleDSPClick(dsp)}
              disabled={selectedDSP === dsp.key || isLoading}
              className={`
                w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-semibold text-base
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
        <p className='text-xs text-gray-500 dark:text-gray-400'>
          If you have the app installed, it will open automatically
        </p>
      </div>
    </div>
  );
});
