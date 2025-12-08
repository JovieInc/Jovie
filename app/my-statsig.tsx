'use client';

import {
  LogLevel,
  StatsigClient,
  type StatsigPlugin,
  StatsigProvider,
} from '@statsig/react-bindings';
import { usePathname } from 'next/navigation';
import React from 'react';
import { publicEnv } from '@/lib/env-public';

export interface MyStatsigProps {
  children: React.ReactNode;
  userId?: string | null;
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
  React.useEffect(() => {
    if (!pathname.startsWith('/dashboard')) {
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

  return (
    <StatsigProvider
      sdkKey={sdkKey}
      user={user}
      options={{
        logLevel: LogLevel.Debug,
        plugins,
      }}
    >
      {children}
    </StatsigProvider>
  );
}
