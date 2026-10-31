'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { isDemoRecordingClient } from '@/lib/demo-recording';
import { env } from '@/lib/env-client';
import { ensureFbqStub, type Fbq } from '@/lib/tracking/use-marketing-consent';

import { useTrackingEligibility } from '@/lib/tracking/use-tracking-eligibility';
import { isolateTrackingDocument } from '@/lib/tracking/vendor-navigation';

const FBEVENTS_SRC = 'https://connect.facebook.net/en_US/fbevents.js';

type MetaPixelWindow = Window & {
  fbq?: Fbq;
  _fbq?: Fbq;
  __jovieMetaPixelInited?: Set<string>;
};

interface MetaPixelProps {
  /** Meta pixel IDs to init (creator pixel + Jovie platform pixel). */
  readonly youngAudience?: boolean;
  readonly pixelIds: readonly string[];
}

/**
 * Browser Meta (Facebook) pixel for public artist surfaces.
 *
 * The first-party JoviePixel + /api/px CAPI forwarding cannot build a Meta
 * website custom audience — retargeting requires the browser pixel. This
 * loads fbevents.js and fires fbq('init') + a PageView per mount, gated on
 * marketing consent (fire-by-default unless explicitly rejected), matching
 * the InstantlyPixel consent wiring.
 */
export function MetaPixel({ pixelIds, youngAudience }: MetaPixelProps) {
  const ids = [...new Set(pixelIds.filter(Boolean))];
  const idsKey = ids.join(',');
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isDemo = isDemoRecordingClient();
  const skip = ids.length === 0 || isPassive || isDemo;
  const hasTrackedPageView = useRef(false);

  const allowed = useTrackingEligibility(skip, youngAudience).facebook;

  useEffect(() => {
    if (skip || !allowed || hasTrackedPageView.current) return;
    if (globalThis.window === undefined) return;
    isolateTrackingDocument();
    hasTrackedPageView.current = true;

    const metaWindow = globalThis.window as MetaPixelWindow;
    const fbq = ensureFbqStub(metaWindow);
    if (!fbq) return;

    // init is idempotent per pixel ID across mounts (client-side navigation
    // remounts this component); PageView fires once per mount and applies to
    // every initialized pixel.
    metaWindow.__jovieMetaPixelInited ??= new Set<string>();
    for (const id of idsKey.split(',')) {
      if (!metaWindow.__jovieMetaPixelInited.has(id)) {
        metaWindow.__jovieMetaPixelInited.add(id);
        fbq('init', id);
      }
    }
    fbq('track', 'PageView');
  }, [skip, allowed, idsKey]);

  if (skip || !allowed) return null;

  return (
    <Script
      id='meta-fbevents-loader'
      src={FBEVENTS_SRC}
      strategy='afterInteractive'
    />
  );
}
