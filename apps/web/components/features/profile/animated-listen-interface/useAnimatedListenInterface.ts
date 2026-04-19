'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  COUNTRY_CODE_COOKIE,
  LISTEN_COOKIE,
} from '@/constants/app';
import { getDSPDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import {
  type AvailableDSP,
  getAvailableDSPs,
  sortDSPsForDevice,
} from '@/lib/dsp';
import { useAppFlag } from '@/lib/flags/client';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useTrackingMutation } from '@/lib/queries/useTrackingMutation';
import { detectPlatformFromUA } from '@/lib/utils';
import type { Artist } from '@/types/db';

export interface UseAnimatedListenInterfaceReturn {
  availableDSPs: AvailableDSP[];
  selectedDSP: string | null;
  prefersReducedMotion: boolean;
  handleDSPClick: (dsp: AvailableDSP) => Promise<void>;
}

export function useAnimatedListenInterface(
  artist: Artist,
  handle: string,
  enableDynamicEngagement: boolean
): UseAnimatedListenInterfaceReturn {
  const enableDevicePriority = useAppFlag('IOS_APPLE_MUSIC_PRIORITY');

  const availableDSPs = useMemo(() => {
    const countryCode =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find(cookie => cookie.trim().startsWith(`${COUNTRY_CODE_COOKIE}=`))
            ?.split('=')[1];

    const userAgent =
      typeof navigator === 'undefined' ? undefined : navigator.userAgent;
    const detectedPlatform = detectPlatformFromUA(userAgent);
    const platform =
      detectedPlatform === 'ios' || detectedPlatform === 'android'
        ? detectedPlatform
        : 'desktop';

    return sortDSPsForDevice(getAvailableDSPs(artist), {
      countryCode: countryCode ?? null,
      platform,
      enableDevicePriority,
    });
  }, [artist, enableDevicePriority]);
  const [selectedDSP, setSelectedDSP] = useState<string | null>(null);
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackClick = useTrackingMutation({
    endpoint: '/api/track',
  });

  // Handle backspace key to go back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleDSPClick = async (dsp: AvailableDSP) => {
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
          '[AnimatedListenInterface] Failed to set localStorage:',
          error
        );
      }

      // Track click
      trackClick.mutate({ handle, linkType: 'listen', target: dsp.key });

      // Try deep linking
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
      console.error('Failed to handle DSP click:', error);
    } finally {
      // Reset selection after a delay
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setSelectedDSP(null), 1000);
    }
  };

  return {
    availableDSPs,
    selectedDSP,
    prefersReducedMotion,
    handleDSPClick,
  };
}
