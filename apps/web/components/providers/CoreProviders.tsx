'use client';

import { TooltipProvider } from '@jovie/ui';
import { PacerProvider } from '@tanstack/react-pacer';
import dynamic, { type DynamicOptionsLoadingProps } from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import React, { useEffect, useMemo, useRef } from 'react';
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

// Global keyboard shortcut listeners are deferred past first paint. Users
// do not press `t` or `/` within the first 300ms of page load, and leaving
// listener attachment on the critical path added two `addEventListener`
// calls plus per-keypress handler dispatch overhead during boot.
const KEYBOARD_SHORTCUT_ATTACH_DELAY_MS = 300;

function ThemeKeyboardShortcut({ isEnabled }: { isEnabled: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();

  // Keep the listener referentially stable — reading the current theme +
  // setter from a ref — so the useEffect below does not re-run and
  // re-defer the listener attachment every time resolvedTheme changes.
  // Without the ref, pressing `t` within 300ms of a theme toggle would
  // do nothing while the new setTimeout was pending.
  const themeRef = useRef({ resolvedTheme, setTheme });
  useEffect(() => {
    themeRef.current = { resolvedTheme, setTheme };
  }, [resolvedTheme, setTheme]);

  useEffect(() => {
    if (!isEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key?.toLowerCase() !== 't') return;
      if (isFormElement(event.target)) return;

      event.preventDefault();
      const { resolvedTheme: currentTheme, setTheme: setCurrentTheme } =
        themeRef.current;
      setCurrentTheme(currentTheme === 'dark' ? 'light' : 'dark');
    }

    const attachHandle = setTimeout(() => {
      globalThis.addEventListener('keydown', handleKeyDown);
    }, KEYBOARD_SHORTCUT_ATTACH_DELAY_MS);

    return () => {
      clearTimeout(attachHandle);
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEnabled]);

  return null;
}

function SearchKeyboardShortcut() {
  useEffect(() => {
    function getVisibleSearchField() {
      return Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[data-app-search-field="true"]'
        )
      ).find(input => {
        if (input.disabled || input.readOnly) return false;
        return input.getClientRects().length > 0;
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== '/') return;
      if (isFormElement(event.target)) return;

      const searchField = getVisibleSearchField();

      if (searchField) {
        event.preventDefault();
        searchField.focus();
        searchField.select();
        return;
      }

      const searchTrigger = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-app-search-trigger="true"]'
        )
      ).find(element => element.getClientRects().length > 0);

      if (!searchTrigger) return;

      event.preventDefault();
      searchTrigger.click();

      globalThis.requestAnimationFrame(() => {
        const promotedSearchField = getVisibleSearchField();
        promotedSearchField?.focus();
        promotedSearchField?.select();
      });
    }

    const attachHandle = setTimeout(() => {
      globalThis.addEventListener('keydown', handleKeyDown);
    }, KEYBOARD_SHORTCUT_ATTACH_DELAY_MS);

    return () => {
      clearTimeout(attachHandle);
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
  themeEnabled,
}: {
  children: React.ReactNode;
  enableAnalytics: boolean;
  enableMonitoring: boolean;
  usePacer: boolean;
  initialThemeMode: ThemeMode;
  themeEnabled: boolean;
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

    let cleanupWebVitals: (() => void) | undefined;
    let isUnmounted = false;

    function dispatchWebVital(metric: unknown) {
      if (typeof globalThis.window === 'undefined') return;
      const event = new CustomEvent('web-vitals', { detail: metric });
      globalThis.dispatchEvent(event);
    }

    function handleWebVitalsReady(
      mod: typeof import('@/lib/monitoring/web-vitals')
    ) {
      const cleanup = mod.initWebVitals(dispatchWebVital);
      if (isUnmounted) {
        cleanup();
        return;
      }
      cleanupWebVitals = cleanup;
    }

    function handleMonitoringReady(
      mod: typeof import('@/lib/monitoring/client')
    ) {
      if (isUnmounted) return;
      mod.initAllMonitoring();
    }

    // Defer monitoring chunks past initial provider hydration so they do
    // not contend with main-thread work during first paint. Web Vitals
    // still captures FCP/LCP/CLS because the underlying PerformanceObserver
    // subscriptions use `{ buffered: true }` to replay early entries.
    const handle = setTimeout(() => {
      import('@/lib/monitoring/web-vitals')
        .then(handleWebVitalsReady)
        .catch(error => {
          logger.error('Failed to initialize Web Vitals:', error);
        });

      if (process.env.NODE_ENV === 'production') {
        import('@/lib/monitoring/client')
          .then(handleMonitoringReady)
          .catch(error => {
            logger.error('Failed to initialize monitoring:', error);
          });
      }
    }, 300);

    return () => {
      isUnmounted = true;
      clearTimeout(handle);
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
      <SearchKeyboardShortcut />
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

/** Marketing route prefixes where analytics are disabled */
const MARKETING_PREFIXES = [
  '/artist-notifications',
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

const THEME_ENABLED_PREFIXES = [
  '/app',
  '/onboarding',
  '/signin',
  '/signup',
  '/waitlist',
] as const;

type CoreProviderVariant = 'full' | 'homepage' | 'public';

export function getCoreProviderVariant(pathname: string): CoreProviderVariant {
  if (pathname === '/') {
    return 'homepage';
  }

  return FULL_PROVIDER_PREFIXES.some(prefix => pathname.startsWith(prefix))
    ? 'full'
    : 'public';
}

export function isThemeEnabledRoute(pathname: string): boolean {
  return THEME_ENABLED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function CoreProviders({
  children,
  initialThemeMode = 'dark',
}: CoreProvidersProps) {
  const pathname = usePathname() ?? '';
  const variant = useMemo(() => getCoreProviderVariant(pathname), [pathname]);
  const themeEnabled = useMemo(() => isThemeEnabledRoute(pathname), [pathname]);
  const isHomepageVariant = variant === 'homepage';
  const isPublicVariant = variant === 'public';
  const isTestRuntime = env.IS_TEST || env.IS_E2E;
  const enableAnalytics = useMemo(
    () =>
      !isTestRuntime &&
      pathname !== '/' &&
      !MARKETING_PREFIXES.some(prefix => pathname.startsWith(prefix)),
    [isTestRuntime, pathname]
  );

  if (isHomepageVariant) {
    return <>{children}</>;
  }

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
