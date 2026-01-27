'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const ToastProvider = dynamic(
  () => import('./ToastProvider').then(mod => ({ default: mod.ToastProvider })),
  {
    ssr: false,
    loading: () => null,
  }
);

const Analytics = dynamic(
  () => import('./Analytics').then(mod => ({ default: mod.Analytics })),
  {
    ssr: false,
    loading: () => null,
  }
);

export interface LazyProvidersProps {
  children: React.ReactNode;
  enableAnalytics?: boolean;
}

/**
 * LazyProviders - Non-critical providers that are lazy-loaded
 *
 * This component wraps non-essential providers that don't need to be
 * in the critical rendering path. They are loaded asynchronously after
 * the initial page load to improve performance.
 *
 * Critical providers (Clerk, ThemeProvider) remain in ClientProviders.
 */
export function LazyProviders({
  children,
  enableAnalytics = true,
}: LazyProvidersProps) {
  return (
    <ToastProvider>
      {children}
      {enableAnalytics ? <Analytics /> : null}
    </ToastProvider>
  );
}
