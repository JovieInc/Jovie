'use client';

import { TooltipProvider } from '@jovie/ui';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import React, { useEffect } from 'react';
import { useChunkErrorHandler } from '@/lib/hooks/useChunkErrorHandler';
import { useVersionMismatchNotification } from '@/lib/hooks/useVersionMismatchNotification';
import { PacerProvider } from '@/lib/pacer';
import { PACER_TIMING } from '@/lib/pacer/hooks';
import { logger } from '@/lib/utils/logger';
import type { ThemeMode } from '@/types';
import type { LazyProvidersProps } from './LazyProviders';
import { NuqsProvider } from './NuqsProvider';
import { QueryProvider } from './QueryProvider';

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

export interface CoreProvidersProps {
  children: React.ReactNode;
  initialThemeMode?: ThemeMode;
}

/**
 * Inner component that must be rendered inside QueryProvider.
 * This ensures hooks that depend on QueryClient context have access to it.
 */
function CoreProvidersInner({
  children,
  enableAnalytics,
  initialThemeMode,
}: {
  children: React.ReactNode;
  enableAnalytics: boolean;
  initialThemeMode: ThemeMode;
}) {
  // Monitor for version mismatches and show notification when detected
  // These hooks require QueryClient context, so they must be called
  // from a component rendered inside QueryProvider
  useVersionMismatchNotification();

  // Handle chunk load errors gracefully (common with version mismatches)
  useChunkErrorHandler();

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

      // Initialize Web Vitals tracking for performance monitoring
      let cleanupWebVitals: (() => void) | undefined;
      let isUnmounted = false;
      import('@/lib/monitoring/web-vitals').then(({ initWebVitals }) => {
        const cleanup = initWebVitals(metric => {
          // Create a custom event for the performance dashboard
          if (typeof window !== 'undefined') {
            const event = new CustomEvent('web-vitals', { detail: metric });
            window.dispatchEvent(event);
          }
        });

        if (isUnmounted) {
          cleanup();
          return;
        }

        cleanupWebVitals = cleanup;
      });

      // Initialize other performance monitoring in production
      if (process.env.NODE_ENV === 'production') {
        import('@/lib/monitoring/client').then(({ initAllMonitoring }) => {
          initAllMonitoring();
        });
      }

      return () => {
        isUnmounted = true;
        if (cleanupWebVitals) {
          cleanupWebVitals();
        }
      };
    } catch (error) {
      console.error('Error initializing monitoring:', error);
      return undefined;
    }
  }, []);

  return (
    <PacerProvider
      defaultOptions={{
        debouncer: { wait: PACER_TIMING.DEBOUNCE_MS },
        throttler: {
          wait: PACER_TIMING.THROTTLE_MS,
          leading: true,
          trailing: true,
        },
      }}
    >
      <ThemeProvider
        attribute='class'
        defaultTheme={initialThemeMode}
        enableSystem
        disableTransitionOnChange
        storageKey='jovie-theme'
      >
        <ThemeKeyboardShortcut />
        <TooltipProvider delayDuration={1200}>
          <LazyProviders enableAnalytics={enableAnalytics}>
            {children}
          </LazyProviders>
        </TooltipProvider>
      </ThemeProvider>
    </PacerProvider>
  );
}

/** Marketing route prefixes where analytics are disabled */
const MARKETING_PREFIXES = [
  '/blog',
  '/changelog',
  '/engagement-engine',
  '/investors',
  '/link-in-bio',
  '/pricing',
  '/support',
  '/waitlist',
] as const;

export function CoreProviders({
  children,
  initialThemeMode = 'system',
}: CoreProvidersProps) {
  const pathname = usePathname() ?? '';
  const isMarketingRoute =
    pathname === '/' ||
    MARKETING_PREFIXES.some(prefix => pathname.startsWith(prefix));
  const enableAnalytics = !isMarketingRoute;

  return (
    <React.StrictMode>
      <NuqsProvider>
        <QueryProvider>
          <CoreProvidersInner
            enableAnalytics={enableAnalytics}
            initialThemeMode={initialThemeMode}
          >
            {children}
          </CoreProvidersInner>
        </QueryProvider>
      </NuqsProvider>
    </React.StrictMode>
  );
}
