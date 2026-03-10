'use client';

import { TooltipProvider } from '@jovie/ui';
import { PacerProvider } from '@tanstack/react-pacer';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import React, { useEffect, useMemo } from 'react';
import { useFeatureGate } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';
import { useChunkErrorHandler } from '@/lib/hooks/useChunkErrorHandler';
import { PACER_TIMING } from '@/lib/pacer/hooks';
import { isFormElement } from '@/lib/utils/keyboard';
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
  const isLightModeEnabled = useFeatureGate(
    FEATURE_FLAG_KEYS.ENABLE_LIGHT_MODE,
    false
  );

  useEffect(() => {
    // Only register theme keyboard shortcut when light mode feature flag is on
    if (!isLightModeEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 't') return;
      if (isFormElement(event.target)) return;

      event.preventDefault();
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [resolvedTheme, setTheme, isLightModeEnabled]);

  return null;
}

// Lazy load non-critical providers to reduce initial bundle size
// SSR enabled to allow page content to render server-side for SEO
// Analytics components inside LazyProviders remain client-only
const LazyProviders = dynamic<LazyProvidersProps>(
  () => import('./LazyProviders').then(mod => ({ default: mod.LazyProviders })),
  {
    ssr: true,
    loading: LazyProvidersSkeleton,
  }
);

export interface CoreProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode?: ThemeMode;
}

/**
 * Inner component that must be rendered inside QueryProvider.
 * This ensures hooks that depend on QueryClient context have access to it.
 */
function CoreProvidersInner({
  children,
  enableAnalytics,
  enableMonitoring,
  usePacer,
  initialThemeMode,
}: {
  children: React.ReactNode;
  enableAnalytics: boolean;
  enableMonitoring: boolean;
  usePacer: boolean;
  initialThemeMode: ThemeMode;
}) {
  // Handle chunk load errors gracefully (common with version mismatches)
  useChunkErrorHandler();

  useEffect(() => {
    if (!enableMonitoring) {
      return;
    }

    // Log startup info
    logger.group('Jovie App');
    logger.info('Booting client providers', {
      vercelEnv: process.env.VERCEL_ENV || 'local',
      nodeEnv: process.env.NODE_ENV,
    });
    logger.groupEnd();

    // Initialize Web Vitals tracking for performance monitoring
    let cleanupWebVitals: (() => void) | undefined;
    let isUnmounted = false;

    import('@/lib/monitoring/web-vitals')
      .then(({ initWebVitals }) => {
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
      })
      .catch(error => {
        logger.error('Failed to initialize Web Vitals:', error);
      });

    // Initialize other performance monitoring in production
    if (process.env.NODE_ENV === 'production') {
      import('@/lib/monitoring/client')
        .then(({ initAllMonitoring }) => {
          initAllMonitoring();
        })
        .catch(error => {
          logger.error('Failed to initialize monitoring:', error);
        });
    }

    return () => {
      isUnmounted = true;
      cleanupWebVitals?.();
    };
  }, [enableMonitoring]);

  const content = (
    <ThemeProvider
      attribute='class'
      forcedTheme='dark'
      defaultTheme='dark'
      enableSystem={false}
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
  );

  if (!usePacer) {
    return content;
  }

  return (
    <PacerProvider
      defaultOptions={{
        debouncer: { wait: PACER_TIMING.DEBOUNCE_MS },
        throttler: {
          wait: PACER_TIMING.THROTTLE_MS,
          leading: true,
          trailing: true,
        },
        rateLimiter: {
          limit: PACER_TIMING.DEFAULT_RATE_LIMIT,
          window: PACER_TIMING.RATE_LIMIT_WINDOW_MS,
          windowType: 'sliding',
        },
        queuer: {
          wait: PACER_TIMING.QUEUE_WAIT_MS,
        },
        batcher: {
          wait: PACER_TIMING.BATCH_WAIT_MS,
        },
      }}
    >
      {content}
    </PacerProvider>
  );
}

/** Marketing route prefixes where analytics are disabled */
const MARKETING_PREFIXES = [
  '/blog',
  '/changelog',
  '/engagement-engine',
  '/investors',
  '/pricing',
  '/support',
  '/waitlist',
] as const;

const FULL_PROVIDER_PREFIXES = [
  '/app',
  '/account',
  '/artist-selection',
  '/billing',
  '/sso-callback',
  '/onboarding',
] as const;

type CoreProviderVariant = 'full' | 'public';

export function getCoreProviderVariant(pathname: string): CoreProviderVariant {
  return FULL_PROVIDER_PREFIXES.some(prefix => pathname.startsWith(prefix))
    ? 'full'
    : 'public';
}

export function CoreProviders({
  children,
  initialThemeMode = 'dark',
}: CoreProvidersProps) {
  const pathname = usePathname() ?? '';
  const variant = useMemo(() => getCoreProviderVariant(pathname), [pathname]);
  const isPublicVariant = variant === 'public';
  const enableAnalytics = useMemo(
    () =>
      pathname !== '/' &&
      !MARKETING_PREFIXES.some(prefix => pathname.startsWith(prefix)),
    [pathname]
  );

  const providers = (
    <NuqsProvider>
      <QueryProvider>
        <CoreProvidersInner
          enableAnalytics={enableAnalytics}
          enableMonitoring={!isPublicVariant}
          initialThemeMode={initialThemeMode}
          usePacer={!isPublicVariant}
        >
          {children}
        </CoreProvidersInner>
      </QueryProvider>
    </NuqsProvider>
  );

  if (isPublicVariant) {
    return providers;
  }

  return <React.StrictMode>{providers}</React.StrictMode>;
}
