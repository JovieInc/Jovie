'use client';

import dynamic from 'next/dynamic';

/**
 * Vercel Web Analytics, loaded after hydration, for the homepage's
 * provider-free shell in CoreProviders (the provider tree mounts it through
 * LazyProviders instead).
 */
export const DeferredAnalytics = dynamic(
  () => import('./Analytics').then(mod => ({ default: mod.Analytics })),
  {
    ssr: false,
    loading: () => null,
  }
);
