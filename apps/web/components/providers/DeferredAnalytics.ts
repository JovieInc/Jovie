'use client';

import dynamic from 'next/dynamic';

/**
 * Vercel Web Analytics, loaded after hydration. One owner for the lazy import
 * so LazyProviders and the homepage's provider-free shell (see CoreProviders)
 * mount the same component.
 */
export const DeferredAnalytics = dynamic(
  () => import('./Analytics').then(mod => ({ default: mod.Analytics })),
  {
    ssr: false,
    loading: () => null,
  }
);
