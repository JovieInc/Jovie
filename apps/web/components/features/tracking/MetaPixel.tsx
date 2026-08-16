'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { isDemoRecordingClient } from '@/lib/demo-recording';
import { env } from '@/lib/env-client';
import { isMarketingAllowed } from '@/lib/tracking/consent';

const FBEVENTS_SRC = 'https://connect.facebook.net/en_US/fbevents.js';

type Fbq = ((...args: unknown[]) => void) & {
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
};

type MetaPixelWindow = Window & {
  fbq?: Fbq;
  _fbq?: Fbq;
  __jovieMetaPixelInited?: Set<string>;
};

interface MetaPixelProps {
  /** Meta pixel IDs to init (creator pixel + Jovie platform pixel). */
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
export function MetaPixel({ pixelIds }: MetaPixelProps) {
  const ids = [...new Set(pixelIds.filter(Boolean))];
  const idsKey = ids.join(',');
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isDemo = isDemoRecordingClient();
  const skip = ids.length === 0 || isPassive || isDemo;
  const hasTrackedPageView = useRef(false);

  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (skip) return;
    if (globalThis.window === undefined) return;

    // Sync consent state on mount (covers SSR → client transition)
    setAllowed(isMarketingAllowed());

    let unsubConsent: (() => void) | undefined;

    const attach = () => {
      if (!globalThis.JVConsent) return;
      unsubConsent = globalThis.JVConsent.onChange(() => {
        setAllowed(isMarketingAllowed());
      });
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

  useEffect(() => {
    if (skip || !allowed || hasTrackedPageView.current) return;
    if (globalThis.window === undefined) return;
    hasTrackedPageView.current = true;

    const metaWindow = globalThis.window as MetaPixelWindow;

    // Stub fbq so calls queue until fbevents.js loads and drains them.
    if (!metaWindow.fbq) {
      const stub = ((...args: unknown[]) => {
        stub.queue?.push(args);
      }) as Fbq;
      stub.queue = [];
      stub.loaded = true;
      stub.version = '2.0';
      metaWindow.fbq = stub;
      metaWindow._fbq = stub;
    }
    const fbq = metaWindow.fbq;
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
