'use client';

import {
  LogLevel,
  StatsigClient,
  type StatsigPlugin,
  StatsigProvider,
  useClientAsyncInit,
} from '@statsig/react-bindings';
import { usePathname } from 'next/navigation';
import React from 'react';
import { publicEnv } from '@/lib/env-public';

export interface MyStatsigProps {
  children: React.ReactNode;
  userId?: string | null;
}

// Stable empty array reference to avoid unnecessary state updates
const EMPTY_PLUGINS: StatsigPlugin<StatsigClient>[] = [];

interface MyStatsigEnabledProps {
  children: React.ReactNode;
  sdkKey: string;
  user: { userID: string };
  plugins: StatsigPlugin<StatsigClient>[];
}

/**
 * Wrapper that initializes Statsig client after mount.
 * Uses a single component to maintain consistent hook count across renders.
 * The client initialization is deferred until after hydration to avoid
 * state updates during render, but hooks are always called.
 */
function StatsigClientProvider({
  children,
  sdkKey,
  user,
  plugins,
}: MyStatsigEnabledProps) {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Always call the hook to maintain consistent hook count
  // Pass a dummy key when not mounted to satisfy the hook requirement
  const { client } = useClientAsyncInit(
    isMounted ? sdkKey : 'not-initialized',
    user,
    {
      logLevel: LogLevel.Debug,
      plugins,
      ...(process.env.NODE_ENV === 'test'
        ? {
            overrideAdapter: {
              getGateOverride: current => {
                const overrides = (
                  window as unknown as {
                    __STATSIG_OVERRIDES__?: Record<string, boolean>;
                  }
                ).__STATSIG_OVERRIDES__;

                const override = overrides?.[current.name];
                if (typeof override !== 'boolean') {
                  return null;
                }

                return {
                  ...current,
                  value: override,
                  ruleID: 'override',
                  details: {
                    ...current.details,
                    reason: 'OverrideAdapter',
                  },
                  __evaluation: current.__evaluation
                    ? {
                        ...current.__evaluation,
                        value: override,
                        rule_id: 'override',
                      }
                    : null,
                };
              },
            },
          }
        : null),
    }
  );

  // Don't wrap with StatsigProvider until mounted to prevent hydration issues
  if (!isMounted) {
    return <>{children}</>;
  }

  return (
    <StatsigProvider client={client} loadingComponent={null}>
      {children}
    </StatsigProvider>
  );
}

export function MyStatsig({ children, userId }: MyStatsigProps) {
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
  // Note: Session replay requires 'unsafe-eval' which is only allowed in development
  // due to CSP restrictions. In production, eval-based replay would violate CSP.
  React.useEffect(() => {
    // Only load session replay in development and on dashboard routes
    if (
      process.env.NODE_ENV !== 'development' ||
      !pathname.startsWith('/app/dashboard')
    ) {
      // Use stable reference and functional update to avoid unnecessary re-renders
      setPlugins(prev => (prev.length === 0 ? prev : EMPTY_PLUGINS));
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

  // If we don't have a configured key, render children without Statsig
  if (!sdkKey) {
    return <>{children}</>;
  }

  return (
    <StatsigClientProvider sdkKey={sdkKey} user={user} plugins={plugins}>
      {children}
    </StatsigClientProvider>
  );
}
