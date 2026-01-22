'use client';

import {
  LogLevel,
  StatsigClient,
  type StatsigPlugin,
  StatsigProvider,
  useClientAsyncInit,
} from '@statsig/react-bindings';
import dynamic from 'next/dynamic';
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

function MyStatsigEnabledInner({
  children,
  sdkKey,
  user,
  plugins,
}: MyStatsigEnabledProps) {
  const { client } = useClientAsyncInit(sdkKey, user, {
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
  });

  return (
    <StatsigProvider client={client} loadingComponent={<div />}>
      {children}
    </StatsigProvider>
  );
}

// Dynamically import with SSR disabled to avoid hydration mismatches
const MyStatsigEnabled = dynamic(() => Promise.resolve(MyStatsigEnabledInner), {
  ssr: false,
});

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
    // Only load session replay in development (when unsafe-eval is allowed in CSP)
    // and on dashboard routes
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
    <MyStatsigEnabled sdkKey={sdkKey} user={user} plugins={plugins}>
      {children}
    </MyStatsigEnabled>
  );
}
