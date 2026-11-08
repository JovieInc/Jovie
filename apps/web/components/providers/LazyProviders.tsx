'use client';

import React from 'react';
import { FeedbackProvider } from '@/components/feedback';
import { env } from '@/lib/env-client';
import { DeferredAnalytics } from './DeferredAnalytics';
import { JovieAnalytics } from './JovieAnalytics';

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
    <FeedbackProvider>
      {children}
      {isPassiveRuntime ? null : <JovieAnalytics />}
      {showAnalytics ? <DeferredAnalytics /> : null}
    </FeedbackProvider>
  );
}
