'use client';

import DOMPurify from 'isomorphic-dompurify';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  LISTEN_COOKIE,
} from '@/constants/app';
import { getDSPDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import { AvailableDSP, getAvailableDSPs } from '@/lib/dsp';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { Artist } from '@/types/db';

export interface UseAnimatedListenInterfaceReturn {
  availableDSPs: AvailableDSP[];
  selectedDSP: string | null;
  prefersReducedMotion: boolean;
  sanitizedLogos: Record<string, string>;
  handleDSPClick: (dsp: AvailableDSP) => Promise<void>;
}

export function useAnimatedListenInterface(
  artist: Artist,
  handle: string,
  enableDynamicEngagement: boolean
): UseAnimatedListenInterfaceReturn {
  const [availableDSPs] = useState<AvailableDSP[]>(() =>
    getAvailableDSPs(artist)
  );
  const [selectedDSP, setSelectedDSP] = useState<string | null>(null);
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sanitize SVG logos to prevent XSS
  const sanitizedLogos = useMemo(() => {
    const logos: Record<string, string> = {};
    for (const dsp of availableDSPs) {
      logos[dsp.key] = DOMPurify.sanitize(dsp.config.logoSvg, {
        USE_PROFILES: { svg: true },
      });
    }
    return logos;
  }, [availableDSPs]);

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
      try {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle, linkType: 'listen', target: dsp.key }),
          keepalive: true,
        }).catch(() => {});
      } catch (error) {
        console.error(
          '[AnimatedListenInterface] Failed to track click:',
          error
        );
      }

      // Try deep linking
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
    sanitizedLogos,
    handleDSPClick,
  };
}
