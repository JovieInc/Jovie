'use client';

import { useEffect, useState } from 'react';
import { isMarketingAllowed } from '@/lib/tracking/consent';

export type Fbq = ((...args: unknown[]) => void) & {
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
};

/**
 * Live marketing-consent state for client tracking components.
 *
 * Syncs once on mount (covers the SSR → client transition), then subscribes
 * to JVConsent — attaching immediately when available or waiting for the
 * `jvconsent:ready` event. Returns false while `skip` is set or before the
 * first sync resolves.
 */
export function useMarketingConsent(skip: boolean): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (skip) return;
    if (globalThis.window === undefined) return;

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

  return allowed;
}

/**
 * Install the queueing fbq stub so pixel calls made before fbevents.js loads
 * are drained instead of dropped. Idempotent; returns the active fbq.
 */
export function ensureFbqStub(metaWindow: {
  fbq?: Fbq;
  _fbq?: Fbq;
}): Fbq | undefined {
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
  return metaWindow.fbq;
}
