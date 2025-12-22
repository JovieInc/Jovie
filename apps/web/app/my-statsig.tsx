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

interface MyStatsigEnabledProps {
  children: React.ReactNode;
  sdkKey: string;
  user: { userID: string };
  plugins: StatsigPlugin<StatsigClient>[];
}

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

  return (
    <MyStatsigEnabled sdkKey={sdkKey} user={user} plugins={plugins}>
      {children}
    </MyStatsigEnabled>
  );
}
