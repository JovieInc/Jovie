'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import type { Consent } from '@/lib/cookies/consent';
import { isDemoRecordingClient } from '@/lib/demo-recording';
import { env } from '@/lib/env-client';
import { publicEnv } from '@/lib/env-public';
import {
  applyGoogleConsentMode,
  consentToGoogleConsentMode,
  isCookieBannerRequiredFromClient,
  isValidGaMeasurementId,
} from '@/lib/tracking/google-consent-mode';

import { useTrackingEligibility } from '@/lib/tracking/use-tracking-eligibility';
import { isolateTrackingDocument } from '@/lib/tracking/vendor-navigation';

function isConsentPayload(value: unknown): value is Consent {
  if (!value || typeof value !== 'object') return false;
  const consent = value as Partial<Consent>;
  return (
    typeof consent.essential === 'boolean' &&
    typeof consent.analytics === 'boolean' &&
    typeof consent.marketing === 'boolean'
  );
}

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

export function GoogleAnalytics() {
  const measurementId = publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isDemo = isDemoRecordingClient();
  const disabled =
    !isValidGaMeasurementId(measurementId) || isPassive || isDemo;
  const allowed = useTrackingEligibility(disabled).ga;
  const skip = disabled || !allowed;

  useEffect(() => {
    if (skip) return;
    if (globalThis.window === undefined) return;

    isolateTrackingDocument();
    const analyticsWindow = globalThis.window as AnalyticsWindow;
    const gtag =
      analyticsWindow.gtag ??
      ((...args: unknown[]) => {
        analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
        analyticsWindow.dataLayer.push(args);
      });
    gtag('js', new Date());
    gtag('config', measurementId);

    const syncConsent = (value: unknown) => {
      if (!isConsentPayload(value)) return;
      applyGoogleConsentMode(
        consentToGoogleConsentMode(value, isCookieBannerRequiredFromClient())
      );
    };

    let unsubConsent: (() => void) | undefined;

    const attach = () => {
      if (!globalThis.JVConsent) return;
      unsubConsent = globalThis.JVConsent.onChange(syncConsent);
    };

    if (globalThis.JVConsent) {
      attach();
      return () => {
        unsubConsent?.();
      };
    }

    const onReady = () => attach();
    globalThis.addEventListener('jvconsent:ready', onReady, { once: true });
    return () => {
      globalThis.removeEventListener('jvconsent:ready', onReady);
      unsubConsent?.();
    };
  }, [measurementId, skip]);

  if (skip) return null;

  return (
    <Script
      id='ga-gtag-loader'
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy='afterInteractive'
    />
  );
}
