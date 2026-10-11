'use client';

import { useEffect } from 'react';
import { publicEnv } from '@/lib/env-public';
import {
  clearAcquisitionId,
  getOrCreateAcquisitionId,
  isAnalyticsAllowed,
} from '@/lib/tracking/consent';

const FIRST_TOUCH_KEY = 'jovie_acquisition_first_touch_v1';

export function AcquisitionCapture() {
  useEffect(() => {
    // Deterministic E2E and visual capture do not persist analytics evidence.
    // Avoid a keepalive request that prevents network-idle certification.
    if (publicEnv.NEXT_PUBLIC_E2E_MODE === '1') return;

    const capture = () => {
      if (!isAnalyticsAllowed()) return;
      const acquisitionId = getOrCreateAcquisitionId();
      if (!acquisitionId) return;

      try {
        let stored = globalThis.localStorage?.getItem(FIRST_TOUCH_KEY);
        if (!stored) {
          const query = new URLSearchParams(globalThis.location.search);
          stored = JSON.stringify({
            source: query.get('utm_source') ?? undefined,
            medium: query.get('utm_medium') ?? undefined,
            campaign: query.get('utm_campaign') ?? undefined,
            term: query.get('utm_term') ?? undefined,
            content: query.get('utm_content') ?? undefined,
            referrer: document.referrer || undefined,
            landingPath: `${globalThis.location.pathname}${globalThis.location.search}`,
            claimId: query.get('claim_id') ?? undefined,
            runId: query.get('run_id') ?? undefined,
            candidateId: query.get('candidate_id') ?? undefined,
            offerVersion: query.get('offer_version') ?? undefined,
          });
          globalThis.localStorage?.setItem(FIRST_TOUCH_KEY, stored);
        }

        fetch('/api/acquisition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          keepalive: true,
          body: JSON.stringify({
            acquisitionId,
            capturedAt: new Date().toISOString(),
            firstTouch: JSON.parse(stored),
          }),
        }).catch(() => undefined);
      } catch {
        // Restricted storage contexts remain unattributed.
      }
    };

    const reconcileConsent = () => {
      if (isAnalyticsAllowed()) capture();
      else clearAcquisitionId();
    };
    let unsubscribe = globalThis.JVConsent?.onChange(reconcileConsent);
    const onConsentReady = () => {
      unsubscribe?.();
      unsubscribe = globalThis.JVConsent?.onChange(reconcileConsent);
    };
    globalThis.addEventListener('jvconsent:ready', onConsentReady);
    capture();
    return () => {
      unsubscribe?.();
      globalThis.removeEventListener('jvconsent:ready', onConsentReady);
    };
  }, []);

  return null;
}
