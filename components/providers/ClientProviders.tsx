'use client';

import { ClerkProvider, useUser } from '@clerk/nextjs';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
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

function ThemeKeyboardShortcut() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 't') return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        const isTextInput =
          tagName === 'input' || tagName === 'textarea' || tagName === 'select';
        if (isTextInput || target.isContentEditable) return;
      }

      event.preventDefault();
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [resolvedTheme, setTheme]);

  return null;
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

interface ClientProvidersInnerBaseProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
  userId?: string;
}

function isMockPublishableKey(publishableKey: string): boolean {
  const lower = publishableKey.toLowerCase();
  return (
    lower.includes('mock') ||
    lower.includes('dummy') ||
    lower.includes('placeholder') ||
    lower.includes('test-key')
  );
}

function ClientProvidersInnerBase({
  children,
  initialThemeMode = 'system',
  userId,
}: ClientProvidersInnerBaseProps) {
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
        <ThemeKeyboardShortcut />
        <MyStatsig userId={userId}>
          <LazyProviders>{children}</LazyProviders>
        </MyStatsig>
      </ThemeProvider>
    </React.StrictMode>
  );
}

// Inner component that uses Clerk hooks (must be inside ClerkProvider)
function ClientProvidersInner({
  children,
  initialThemeMode = 'system',
}: Omit<ClientProvidersProps, 'publishableKey'>) {
  const { user } = useUser();

  return (
    <ClientProvidersInnerBase
      userId={user?.id}
      initialThemeMode={initialThemeMode}
    >
      {children}
    </ClientProvidersInnerBase>
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
  const shouldBypassClerk =
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

  if (shouldBypassClerk) {
    return (
      <ClientProvidersInnerBase initialThemeMode={initialThemeMode}>
        {children}
      </ClientProvidersInnerBase>
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
