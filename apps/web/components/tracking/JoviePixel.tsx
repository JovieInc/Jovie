'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  getOrCreateSessionId,
  isTrackingAllowed,
} from '@/lib/tracking/consent';

interface JoviePixelProps {
  profileId: string;
}

interface PixelEventPayload {
  profileId: string;
  sessionId: string;
  eventType: 'page_view' | 'link_click' | 'form_submit' | 'scroll_depth';
  eventData?: Record<string, unknown>;
  consent: boolean;
  referrer?: string;
  pageUrl?: string;
}

/**
 * Lightweight Jovie pixel for server-side event forwarding.
 * ~1kb gzipped, no external dependencies.
 *
 * Events are sent to /api/px and forwarded server-side to:
 * 1. Jovie's own marketing pixels
 * 2. Creator's configured pixels (Facebook CAPI, Google MP, TikTok Events API)
 */
export function JoviePixel({ profileId }: JoviePixelProps) {
  const hasTrackedPageView = useRef(false);
  const sessionId = useRef<string>('');

  // Initialize session ID on mount
  useEffect(() => {
    sessionId.current = getOrCreateSessionId();
  }, []);

  /**
   * Send event to /api/px using sendBeacon for reliability
   * Falls back to fetch if sendBeacon unavailable
   */
  const sendEvent = useCallback(
    async (
      eventType: PixelEventPayload['eventType'],
      eventData?: Record<string, unknown>
    ) => {
      const hasConsent = isTrackingAllowed();

      // Still send event even without consent, but mark it
      // Server will decide what to forward based on consent
      const payload: PixelEventPayload = {
        profileId,
        sessionId: sessionId.current,
        eventType,
        eventData: {
          ...eventData,
          // Include UTM params if present
          ...getUTMParams(),
        },
        consent: hasConsent,
        referrer: document.referrer || undefined,
        pageUrl: window.location.href,
      };

      const body = JSON.stringify(payload);

      // Use sendBeacon for reliability (survives page unload)
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        const sent = navigator.sendBeacon('/api/px', blob);
        if (sent) return;
      }

      // Fallback to fetch
      try {
        await fetch('/api/px', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        });
      } catch {
        // Silently fail - tracking should never break the page
      }
    },
    [profileId]
  );

  // Track page view on mount
  useEffect(() => {
    if (hasTrackedPageView.current) return;
    hasTrackedPageView.current = true;

    // Small delay to ensure session ID is set
    const timer = setTimeout(() => {
      sendEvent('page_view');
    }, 100);

    return () => clearTimeout(timer);
  }, [sendEvent]);

  // Set up link click tracking
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      // Guard against non-Element targets (e.g., TextNode)
      if (!(e.target instanceof Element)) return;

      const link = e.target.closest('a[data-track-link]');

      if (link instanceof HTMLAnchorElement) {
        const linkId = link.dataset.linkId;
        const linkUrl = link.getAttribute('href');
        const linkTitle = link.dataset.linkTitle ?? link.textContent;

        sendEvent('link_click', {
          linkId,
          linkUrl,
          linkTitle,
        });
      }
    };

    document.addEventListener('click', handleLinkClick, { capture: true });
    return () =>
      document.removeEventListener('click', handleLinkClick, { capture: true });
  }, [sendEvent]);

  // Set up form submit tracking
  useEffect(() => {
    const handleFormSubmit = (e: Event) => {
      // Guard against non-HTMLFormElement targets
      if (!(e.target instanceof HTMLFormElement)) return;

      const form = e.target;
      if (form.hasAttribute('data-track-form')) {
        const formType = form.dataset.formType ?? 'unknown';

        sendEvent('form_submit', {
          formType,
        });
      }
    };

    document.addEventListener('submit', handleFormSubmit, { capture: true });
    return () =>
      document.removeEventListener('submit', handleFormSubmit, {
        capture: true,
      });
  }, [sendEvent]);

  // Expose tracking function globally for programmatic use
  useEffect(() => {
    // @ts-expect-error - Adding to window for external access
    window.joviePixel = {
      track: sendEvent,
      getSessionId: () => sessionId.current,
    };

    return () => {
      // @ts-expect-error - Cleanup
      delete window.joviePixel;
    };
  }, [sendEvent]);

  // This component renders nothing
  return null;
}

/**
 * Extract UTM parameters from current URL
 */
function getUTMParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};

  const utmKeys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
  ];

  for (const key of utmKeys) {
    const value = params.get(key);
    if (value) {
      utm[key] = value;
    }
  }

  return utm;
}
