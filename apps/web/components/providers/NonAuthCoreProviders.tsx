'use client';

import { TooltipProvider } from '@jovie/ui';
import { PacerProvider } from '@tanstack/react-pacer';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import React, { useEffect } from 'react';
import { env } from '@/lib/env-client';
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

const LazyProviders = dynamic<LazyProvidersProps>(
  () => import('./LazyProviders').then(mod => ({ default: mod.LazyProviders })),
  {
    ssr: true,
    loading: LazyProvidersSkeleton,
  }
);

function ThemeKeyboardShortcut({ isEnabled }: { isEnabled: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (!isEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!event.key || event.key.toLowerCase() !== 't') return;
      if (isFormElement(event.target)) return;

      event.preventDefault();
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [resolvedTheme, setTheme, isEnabled]);

  return null;
}

function CoreProvidersInner({
  children,
  enableAnalytics,
  enableMonitoring,
  usePacer,
  initialThemeMode,
  themeEnabled,
}: {
  children: React.ReactNode;
  enableAnalytics: boolean;
  enableMonitoring: boolean;
  usePacer: boolean;
  initialThemeMode: ThemeMode;
  themeEnabled: boolean;
}) {
  useChunkErrorHandler();

  useEffect(() => {
    if (!enableMonitoring) {
      return;
    }

    logger.group('Jovie App');
    logger.info('Booting client providers', {
      vercelEnv: process.env.VERCEL_ENV || 'local',
      nodeEnv: process.env.NODE_ENV,
    });
    logger.groupEnd();

    let cleanupWebVitals: (() => void) | undefined;
    let isUnmounted = false;

    import('@/lib/monitoring/web-vitals')
      .then(({ initWebVitals }) => {
        const cleanup = initWebVitals(metric => {
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
      forcedTheme={themeEnabled ? undefined : 'dark'}
      defaultTheme={themeEnabled ? initialThemeMode : 'dark'}
      enableSystem={themeEnabled}
      disableTransitionOnChange
      storageKey='jovie-theme'
    >
      <ThemeKeyboardShortcut isEnabled={themeEnabled} />
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

interface NonAuthCoreProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode: ThemeMode;
  readonly pathname: string;
  readonly themeEnabled: boolean;
  readonly isPublicVariant: boolean;
}

const MARKETING_PREFIXES = [
  '/blog',
  '/changelog',
  '/engagement-engine',
  '/investors',
  '/pricing',
  '/signin',
  '/signup',
  '/support',
  '/waitlist',
] as const;

export function NonAuthCoreProviders({
  children,
  initialThemeMode,
  pathname,
  themeEnabled,
  isPublicVariant,
}: NonAuthCoreProvidersProps) {
  const isTestRuntime = env.IS_TEST || env.IS_E2E;
  const enableAnalytics =
    !isTestRuntime &&
    pathname !== '/' &&
    !MARKETING_PREFIXES.some(prefix => pathname.startsWith(prefix));

  const providers = (
    <NuqsProvider>
      <QueryProvider>
        <CoreProvidersInner
          enableAnalytics={enableAnalytics}
          enableMonitoring={!isPublicVariant && !isTestRuntime}
          initialThemeMode={initialThemeMode}
          themeEnabled={themeEnabled}
          usePacer={!isPublicVariant}
        >
          {children}
        </CoreProvidersInner>
      </QueryProvider>
    </NuqsProvider>
  );

  if (isPublicVariant || isTestRuntime) {
    return providers;
  }

  return <React.StrictMode>{providers}</React.StrictMode>;
}
