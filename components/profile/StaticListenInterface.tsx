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
}

export const StaticListenInterface = React.memo(function StaticListenInterface({
  artist,
  handle,
}: StaticListenInterfaceProps) {
  const [dsps] = useState<AvailableDSP[]>(() => getAvailableDSPs(artist));
  const [selectedDSP, setSelectedDSP] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Mock DSPs for demo purposes if none are available
  const mockDSPs: AvailableDSP[] = [
    {
      key: 'spotify',
      name: 'Spotify',
      url: 'https://open.spotify.com/artist/1HY2Jd0NmPuamShAr6KMms',
      config: {
        name: 'Spotify',
        color: '#1DB954',
        textColor: 'white',
        logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Spotify</title><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.48.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.32 11.28-1.08 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
      },
    },
    {
      key: 'apple_music',
      name: 'Apple Music',
      url: 'https://music.apple.com/artist/277293880',
      config: {
        name: 'Apple Music',
        color: '#FA243C',
        textColor: 'white',
        logoSvg: `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Apple Music</title><path d="M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.31-1.062-2.31-2.18-3.043C21.003.517 20.373.285 19.7.164c-.517-.093-1.038-.135-1.564-.15-.04-.002-.083-.01-.124-.013H5.988c-.152.01-.303.017-.455.034C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208c-.192.448-.292.925-.363 1.408-.056.392-.088.785-.097 1.18V17.22c.009.394.041.787.097 1.179.071.483.171.96.363 1.408.565 1.328 1.529 2.25 2.865 2.78.703.278 1.446.358 2.193.393.152.017.303.024.455.034h11.124c.041-.003.084-.011.124-.013.526-.015 1.047-.057 1.564-.15.673-.121 1.303-.353 1.877-.717 1.118-.733 1.863-1.733 2.18-3.043.175-.72.24-1.452.24-2.19V6.124zM9.455 15.054c-.474 0-.901-.142-1.278-.417a2.505 2.505 0 0 1-.835-1.166 2.654 2.654 0 0 1-.093-1.421c.14-.49.417-.912.83-1.267.413-.355.906-.532 1.48-.532.573 0 1.067.177 1.48.532.413.355.69.777.83 1.267.14.49.098.98-.093 1.421a2.505 2.505 0 0 1-.835 1.166c-.377.275-.804.417-1.278.417zm9.12-.139c0 .312-.102.578-.307.798-.205.22-.456.33-.752.33-.297 0-.547-.11-.752-.33-.205-.22-.307-.486-.307-.798V9.903c0-.312.102-.578.307-.798.205-.22.455-.33.752-.33.296 0 .547.11.752.33.205.22.307.486.307.798v5.012z"/></svg>`,
      },
    },
  ];

  const availableDSPs = dsps.length > 0 ? dsps : mockDSPs;

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
      } catch {};

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
        {availableDSPs.map(dsp => (
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
              className='flex-shrink-0'
              dangerouslySetInnerHTML={{ __html: dsp.config.logoSvg }}
            />
            <span>
              {selectedDSP === dsp.key ? 'Opening...' : `Open in ${dsp.name}`}
            </span>
          </button>
        ))}
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
