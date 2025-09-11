'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from 'next-themes';
import React, { type ComponentProps, useEffect, useState } from 'react';
import { Analytics } from '@/components/Analytics';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';
import type { ThemeMode } from '@/types';
import { ToastProvider } from './ToastProvider';
import { TooltipProvider } from '@jovie/ui';

// import { Toolbar } from '@vercel/toolbar/next';

interface ClientProvidersProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
}

function ClerkWrapper({ children }: { children: React.ReactNode }) {
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // In test mode without Clerk keys, bypass authentication
  if (!publishableKey) {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      // Bypass Clerk in test/dev mode when no keys are provided
      logger.debug('Bypassing Clerk authentication (no keys provided)');
      return <>{children}</>;
    }

    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='text-center'>
          <h1 className='text-2xl font-bold text-red-600 mb-4'>
            Configuration Error
          </h1>
          <p className='text-gray-600'>
            Clerk publishable key is not configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider
      clerkJSVersion='latest'
      publishableKey={publishableKey}
      appearance={
        {
          elements: {
            rootBox: 'bg-base text-primary',
            card: 'bg-surface-1 border border-subtle dark:border-default',
            headerTitle: 'text-primary',
            headerSubtitle: 'text-secondary',
            formFieldInput:
              'bg-surface-0 border border-default focus-ring-themed',
            formButtonPrimary: 'btn btn-primary btn-md',
            socialButtonsBlockButton: 'btn btn-secondary btn-md',
            footerActionText: 'text-secondary',
            footerActionLink: 'text-accent-token',
          },
        } as ComponentProps<typeof ClerkProvider>['appearance']
      }
    >
      {children}
    </ClerkProvider>
  );
}

export function ClientProviders({
  children,
  initialThemeMode = 'system',
}: ClientProvidersProps) {
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsClient(true);

    // Add a small delay to ensure proper hydration
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 100);

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

    return () => clearTimeout(timer);
  }, []);

  // Show loading state during hydration
  if (!isClient || isLoading) {
    return (
      <div className='min-h-dvh grid place-items-center bg-[rgb(10,10,11)] text-[rgb(235,235,235)] dark:bg-black dark:text-white'>
        <div className='flex items-center gap-3'>
          <span className='size-2 rounded-full animate-ping bg-current' />
          <span className='text-sm tracking-wide'>Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <React.StrictMode>
      <ClerkWrapper>
        <ThemeProvider
          attribute='class'
          defaultTheme={initialThemeMode}
          enableSystem={true}
          disableTransitionOnChange
          storageKey='jovie-theme'
        >
          <TooltipProvider delayDuration={120}>
            <ToastProvider>
              {children}
              <Analytics />
              {/* <Toolbar /> */}
            </ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </ClerkWrapper>
    </React.StrictMode>
  );
}
