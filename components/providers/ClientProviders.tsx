'use client';

import { useUser } from '@clerk/nextjs';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import React, { useEffect } from 'react';
import { MyStatsig } from '@/app/my-statsig';
import { logger } from '@/lib/utils/logger';
import type { ThemeMode } from '@/types';
import type { LazyProvidersProps } from './LazyProviders';

type LazyProvidersLoadingProps = LazyProvidersProps &
  DynamicOptionsLoadingProps;

function LazyProvidersSkeleton(props: DynamicOptionsLoadingProps) {
  const { children } = props as LazyProvidersLoadingProps;
  return <>{children}</>;
}

// Lazy load non-critical providers to reduce initial bundle size
const LazyProviders = dynamic<LazyProvidersProps>(
  () => import('./LazyProviders').then(mod => ({ default: mod.LazyProviders })),
  {
    ssr: false,
    loading: LazyProvidersSkeleton,
  }
);

interface ClientProvidersProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
}

export function ClientProviders({
  children,
  initialThemeMode = 'system',
}: ClientProvidersProps) {
  const { user } = useUser();

  useEffect(() => {
    // Environment-gated startup log
    try {
      logger.group('Jovie App');
      logger.info('Booting client providers', {
        vercelEnv: process.env.VERCEL_ENV || 'local',
        nodeEnv: process.env.NODE_ENV,
      });
      // Feature flags removed - pre-launch
      logger.groupEnd();

      // Initialize Web Vitals tracking - temporarily disabled due to import issues
      // import('@/lib/monitoring/web-vitals').then(({ initWebVitals }) => {
      //   initWebVitals((metric) => {
      //     // Create a custom event for the performance dashboard
      //     if (typeof window !== 'undefined') {
      //       const event = new CustomEvent('web-vitals', { detail: metric });
      //       window.dispatchEvent(event);
      //     }
      //   });
      // });

      // Initialize other performance monitoring - temporarily disabled
      // import('@/lib/monitoring').then(({ initAllMonitoring }) => {
      //   initAllMonitoring();
      // });
    } catch (error) {
      console.error('Error initializing monitoring:', error);
    }
  }, []);

  return (
    <React.StrictMode>
      <ThemeProvider
        attribute='class'
        defaultTheme={initialThemeMode}
        enableSystem={true}
        disableTransitionOnChange
        storageKey='jovie-theme'
      >
        <MyStatsig userId={user?.id}>
          <LazyProviders>{children}</LazyProviders>
        </MyStatsig>
      </ThemeProvider>
    </React.StrictMode>
  );
}
