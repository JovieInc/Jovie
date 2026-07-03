'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import type { Consent } from '@/lib/cookies/consent';
import { isDemoRecordingClient } from '@/lib/demo-recording';
import { env } from '@/lib/env-client';
import { publicEnv } from '@/lib/env-public';
import {
  applyGoogleConsentMode,
  buildGoogleAnalyticsConfigScript,
  consentToGoogleConsentMode,
  isCookieBannerRequiredFromClient,
  isValidGaMeasurementId,
} from '@/lib/tracking/google-consent-mode';

function isConsentPayload(value: unknown): value is Consent {
  if (!value || typeof value !== 'object') return false;
  const consent = value as Partial<Consent>;
  return (
    typeof consent.essential === 'boolean' &&
    typeof consent.analytics === 'boolean' &&
    typeof consent.marketing === 'boolean'
  );
}

export function GoogleAnalytics() {
  const measurementId = publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isDemo = isDemoRecordingClient();
  const skip = !isValidGaMeasurementId(measurementId) || isPassive || isDemo;

  useEffect(() => {
    if (skip) return;
    if (globalThis.window === undefined) return;

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
  }, [skip]);

  if (skip) return null;

  return (
    <>
      <Script
        id='ga-gtag-loader'
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy='afterInteractive'
      />
      <Script id='ga-config' strategy='afterInteractive'>
        {buildGoogleAnalyticsConfigScript(measurementId)}
      </Script>
    </>
  );
}
