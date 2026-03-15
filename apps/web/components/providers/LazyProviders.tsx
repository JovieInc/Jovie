'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { env } from '@/lib/env-client';
import { ClerkAnalytics } from './ClerkAnalytics';

const ToastProvider = dynamic(
  () => import('./ToastProvider').then(mod => ({ default: mod.ToastProvider })),
  {
    ssr: true,
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
  readonly children: React.ReactNode;
  readonly enableAnalytics?: boolean;
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
  const isPassiveRuntime = env.IS_TEST || env.IS_E2E;
  const showAnalytics = enableAnalytics && !isPassiveRuntime;

  return (
    <ToastProvider>
      {children}
      {isPassiveRuntime ? null : <ClerkAnalytics />}
      {showAnalytics ? <Analytics /> : null}
    </ToastProvider>
  );
}
