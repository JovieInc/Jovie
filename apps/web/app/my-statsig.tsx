/**
 * @module my-statsig
 *
 * Statsig provider component with support for server-side bootstrapped initialization.
 *
 * ## Initialization Modes
 *
 * This module provides two initialization modes for the Statsig SDK:
 *
 * ### Bootstrap Mode (Recommended for authenticated pages)
 *
 * When `bootstrapData` is provided, the SDK initializes synchronously using
 * pre-fetched data from the server. Feature flags are available immediately
 * with zero latency.
 *
 * **Benefits:**
 * - No client-side network request needed
 * - Feature flags available in ~0ms vs 100-300ms
 * - No flash of loading state or content shift
 *
 * ### Async Mode (Fallback)
 *
 * When `bootstrapData` is null/undefined, the SDK uses standard async initialization.
 * This triggers a network request to Statsig servers and shows a loading component
 * until data is ready.
 *
 * **When this happens:**
 * - Server-side bootstrap fetch failed (network error, API error)
 * - Missing STATSIG_SERVER_API_KEY on server
 * - Component rendered without bootstrap data
 *
 * ## Usage
 *
 * ```tsx
 * // Server component (layout.tsx):
 * const bootstrapData = await fetchStatsigBootstrapData(userId);
 *
 * // Pass to MyStatsig:
 * <MyStatsig userId={userId} bootstrapData={bootstrapData}>
 *   {children}
 * </MyStatsig>
 * ```
 */
'use client';

import {
  LogLevel,
  StatsigClient,
  type StatsigPlugin,
  StatsigProvider,
  useClientAsyncInit,
  useClientBootstrapInit,
} from '@statsig/react-bindings';
import { usePathname } from 'next/navigation';
import React from 'react';
import { publicEnv } from '@/lib/env-public';
import type { StatsigBootstrapData } from '@/lib/statsig/types';

/**
 * Props for the main MyStatsig component.
 *
 * @property children - Child components that will have access to Statsig context
 * @property userId - Optional user ID for Statsig. Defaults to 'anonymous' if not provided.
 * @property bootstrapData - Optional pre-fetched bootstrap data from server.
 *                           When provided, enables synchronous initialization.
 *                           When null/undefined, falls back to async initialization.
 */
export interface MyStatsigProps {
  children: React.ReactNode;
  userId?: string | null;
  /** Optional pre-fetched bootstrap data from server for instant initialization */
  bootstrapData?: StatsigBootstrapData | null;
}

/**
 * Props for the async initialization component.
 * @internal Used by MyStatsigEnabled for standard async Statsig initialization.
 */
interface MyStatsigEnabledProps {
  children: React.ReactNode;
  sdkKey: string;
  user: { userID: string };
  plugins: StatsigPlugin<StatsigClient>[];
}

/**
 * Props for the bootstrapped initialization component.
 * @internal Used by MyStatsigBootstrapped for synchronous initialization with pre-fetched data.
 */
interface MyStatsigBootstrappedProps {
  children: React.ReactNode;
  sdkKey: string;
  user: { userID: string };
  /** Pre-fetched bootstrap data - required for synchronous initialization */
  bootstrapData: StatsigBootstrapData;
  plugins: StatsigPlugin<StatsigClient>[];
}

/**
 * Internal component for async Statsig initialization (fallback mode).
 *
 * Uses `useClientAsyncInit` hook which:
 * - Makes a network request to Statsig servers on mount
 * - Shows a loading component while fetching (empty div to prevent layout shift)
 * - Provides Statsig context once data is loaded
 *
 * @internal This is an internal component - use MyStatsig as the public API.
 */
function MyStatsigEnabled({
  children,
  sdkKey,
  user,
  plugins,
}: MyStatsigEnabledProps) {
  const { client } = useClientAsyncInit(sdkKey, user, {
    logLevel: LogLevel.Debug,
    plugins,
  });

  return (
    <StatsigProvider client={client} loadingComponent={<div />}>
      {children}
    </StatsigProvider>
  );
}

/**
 * Internal component for synchronous Statsig initialization with bootstrap data.
 *
 * Uses `useClientBootstrapInit` hook which:
 * - Initializes the Statsig client synchronously using pre-fetched data
 * - Provides immediate access to feature flags without network request
 * - Renders children immediately without any loading state
 *
 * The bootstrap data must be JSON-stringified before passing to the hook.
 * We memoize this operation for performance.
 *
 * @internal This is an internal component - use MyStatsig as the public API.
 */
function MyStatsigBootstrapped({
  children,
  sdkKey,
  user,
  bootstrapData,
  plugins,
}: MyStatsigBootstrappedProps) {
  // Stringify the bootstrap data for the useClientBootstrapInit hook
  const initialValues = React.useMemo(
    () => JSON.stringify(bootstrapData),
    [bootstrapData]
  );

  // useClientBootstrapInit initializes the client synchronously with bootstrap values
  const client = useClientBootstrapInit(sdkKey, user, initialValues, {
    logLevel: LogLevel.Debug,
    plugins,
  });

  return <StatsigProvider client={client}>{children}</StatsigProvider>;
}

/**
 * Main Statsig provider component with automatic mode selection.
 *
 * This component automatically chooses between two initialization modes:
 *
 * ## Bootstrap Mode (Preferred)
 *
 * Activated when `bootstrapData` prop is provided (non-null/undefined).
 *
 * - Uses `useClientBootstrapInit` for synchronous initialization
 * - Feature flags available immediately (0ms latency)
 * - No network request on client
 * - No loading state or content flash
 *
 * ## Async Mode (Fallback)
 *
 * Activated when `bootstrapData` is null or undefined.
 *
 * - Uses `useClientAsyncInit` for async initialization
 * - Makes network request to Statsig servers
 * - Shows empty div while loading to prevent layout shift
 * - Feature flags available after ~100-300ms
 *
 * ## Session Replay Plugin
 *
 * On dashboard pages (`/app/dashboard/*`), the component dynamically loads
 * the Statsig session replay plugin. This is done lazily to avoid increasing
 * bundle size for non-dashboard pages.
 *
 * ## SDK Key Handling
 *
 * If `NEXT_PUBLIC_STATSIG_CLIENT_KEY` is not configured (e.g., in preview
 * environments), the component renders children directly without Statsig
 * initialization.
 *
 * @example
 * ```tsx
 * // With bootstrap data (recommended for authenticated pages):
 * <MyStatsig userId={userId} bootstrapData={bootstrapData}>
 *   <Dashboard />
 * </MyStatsig>
 *
 * // Without bootstrap data (async fallback):
 * <MyStatsig userId={userId}>
 *   <PublicPage />
 * </MyStatsig>
 * ```
 */
export function MyStatsig({ children, userId, bootstrapData }: MyStatsigProps) {
  const sdkKey = publicEnv.NEXT_PUBLIC_STATSIG_CLIENT_KEY;
  const pathname = usePathname();
  const [plugins, setPlugins] = React.useState<StatsigPlugin<StatsigClient>[]>(
    []
  );

  const user = React.useMemo(
    () => ({
      userID: userId ?? 'anonymous',
    }),
    [userId]
  );

  // Dynamically import session replay plugin only on client and for dashboard
  React.useEffect(() => {
    if (!pathname.startsWith('/app/dashboard')) {
      setPlugins([]);
      return;
    }

    let cancelled = false;
    import('@statsig/session-replay')
      .then(({ StatsigSessionReplayPlugin }) => {
        if (!cancelled) {
          setPlugins([new StatsigSessionReplayPlugin()]);
        }
      })
      .catch(() => {
        // Session replay not critical - fail silently
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // If we don't have a configured key, bail out quietly (previews/staging)
  if (!sdkKey) {
    return <>{children}</>;
  }

  // Use bootstrap mode if pre-fetched data is available, otherwise fall back to async
  if (bootstrapData) {
    return (
      <MyStatsigBootstrapped
        sdkKey={sdkKey}
        user={user}
        bootstrapData={bootstrapData}
        plugins={plugins}
      >
        {children}
      </MyStatsigBootstrapped>
    );
  }

  return (
    <MyStatsigEnabled sdkKey={sdkKey} user={user} plugins={plugins}>
      {children}
    </MyStatsigEnabled>
  );
}
