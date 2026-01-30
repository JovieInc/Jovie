'use client';

import { useEffect } from 'react';
import { DSPButtonGroup } from '@/components/molecules/DSPButtonGroup';
import { LISTEN_COOKIE } from '@/constants/app';
import { track } from '@/lib/analytics';
import { getDSPDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import type { AvailableDSP } from '@/lib/dsp';
import { captureError } from '@/lib/error-tracking';

export interface ListenSectionProps {
  /** Artist handle for tracking */
  handle: string;
  /** Available DSP platforms */
  dsps: AvailableDSP[];
  /** Initial preferred URL to auto-open */
  initialPreferredUrl?: string | null;
  /** Button size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Whether to show the preference notice */
  showPreferenceNotice?: boolean;
  /** Custom preference notice text */
  preferenceNoticeText?: string;
  /** Whether to enable automatic preference saving */
  savePreferences?: boolean;
  /** Whether to enable deep linking */
  enableDeepLinks?: boolean;
  /** Whether to enable analytics tracking */
  enableTracking?: boolean;
}

export function ListenSection({
  handle,
  dsps,
  initialPreferredUrl,
  size = 'md',
  className = '',
  showPreferenceNotice = true,
  preferenceNoticeText = 'Your preference will be saved for next time',
  savePreferences = true,
  enableDeepLinks = true,
  enableTracking = true,
}: ListenSectionProps) {
  useEffect(() => {
    // Auto open preferred URL if provided
    if (initialPreferredUrl) {
      try {
        window.open(initialPreferredUrl, '_blank', 'noopener,noreferrer');
      } catch {
        // noop - silent fail for better UX
      }
    }
  }, [initialPreferredUrl]);

  const handleDSPClick = async (dspKey: string, url: string) => {
    try {
      // Save preference for 1 year
      if (savePreferences) {
        document.cookie = `${LISTEN_COOKIE}=${dspKey}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        try {
          localStorage.setItem(LISTEN_COOKIE, dspKey);
        } catch {
          // localStorage might be disabled in some browsers
        }
      }

      // Fire-and-forget tracking
      if (enableTracking) {
        try {
          track('listen_button_click', {
            handle,
            linkType: 'listen',
            target: dspKey,
          });
        } catch {
          // noop
        }
      }

      // Try deep linking if enabled
      if (enableDeepLinks) {
        const deepLinkConfig = getDSPDeepLinkConfig(dspKey);

        if (deepLinkConfig) {
          try {
            await openDeepLink(url, deepLinkConfig, {
              onNativeAttempt: () => {
                // Optional: could add loading state here
              },
              onFallback: () => {
                // Optional: could track fallback usage
              },
            });
            return; // Successfully handled by deep link
          } catch (error) {
            console.debug('Deep link failed, using fallback:', error);
            // Fall through to regular URL opening
          }
        }
      }

      // Fallback: use regular URL opening
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      captureError('Error handling DSP click', error, {
        handle,
        dspKey,
        url,
      });
      // Last resort: try to open the URL anyway
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        // noop - complete failure, but don't crash the app
      }
    }
  };

  return (
    <div className={className} data-test='listen-btn'>
      <DSPButtonGroup
        dsps={dsps}
        onDSPClick={handleDSPClick}
        size={size}
        showPreferenceNotice={showPreferenceNotice}
        preferenceNoticeText={preferenceNoticeText}
      />
    </div>
  );
}
