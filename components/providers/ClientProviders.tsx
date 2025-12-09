'use client';

import { ClerkProvider, useUser } from '@clerk/nextjs';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import React, { useEffect, useState } from 'react';
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
  publishableKey: string;
}

// Inner component that uses Clerk hooks (must be inside ClerkProvider)
function ClientProvidersInner({
  children,
  initialThemeMode = 'system',
}: Omit<ClientProvidersProps, 'publishableKey'>) {
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

// Clerk appearance config
const clerkAppearance = {
  elements: {
    rootBox: 'bg-base text-primary',
    card: 'bg-surface-1 border border-subtle dark:border-default',
    headerTitle: 'text-primary',
    headerSubtitle: 'text-secondary',
    formFieldInput: 'bg-surface-0 border border-default focus-ring-themed',
    formButtonPrimary: 'btn btn-primary btn-md',
    socialButtonsBlockButton: 'btn btn-secondary btn-md',
    footerActionText: 'text-secondary',
    footerActionLink: 'text-accent-token',
  },
};

// Main export - wraps children with ClerkProvider (client-side only)
// Uses hydration guard to prevent SSR of ClerkProvider which accesses window
export function ClientProviders({
  children,
  initialThemeMode = 'system',
  publishableKey,
}: ClientProvidersProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR and initial hydration, render children without Clerk
  // This prevents the window is not defined error from ClerkJSScript
  if (!mounted) {
    return (
      <ThemeProvider
        attribute='class'
        defaultTheme={initialThemeMode}
        enableSystem={true}
        disableTransitionOnChange
        storageKey='jovie-theme'
      >
        {children}
      </ThemeProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
      <ClientProvidersInner initialThemeMode={initialThemeMode}>
        {children}
      </ClientProvidersInner>
    </ClerkProvider>
  );
}
